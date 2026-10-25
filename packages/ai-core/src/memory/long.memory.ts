import { PostgresStore } from '@langchain/langgraph-checkpoint-postgres/store';
import { createMiddleware, tool } from 'langchain';
import { z } from 'zod';

const user = process.env.POSTGRES_USER;
const password = process.env.POSTGRES_PASSWORD;
const host = process.env.POSTGRES_HOST;
const port = process.env.POSTGRES_PORT;
const db = process.env.POSTGRES_DB;
const schema = process.env.POSTGRES_SCHEMA;

export const store = PostgresStore.fromConnString(
  `postgresql://${user}:${password}@${host}:${port}/${db}`,
  { schema },
);

export async function setupStore(): Promise<void> {
  await store.setup();
}

// 兜底条目,承载无法归入固定字段的持久信息
export const profileNoteSchema = z.object({
  content: z.string().describe('一条无法归入固定字段的持久信息'),
});

// 用户画像,长期记忆以单份 JSON 文档的形式持续更新
export const userProfileSchema = z.object({
  // 身份
  displayName: z.string().optional().describe('用户的称呼、昵称或真名'),
  occupation: z.string().optional().describe('用户的职业或所处行业'),
  expertise: z.array(z.string()).optional().describe('专业领域、经验水平与背景'),
  locale: z.string().optional().describe('语言与地区偏好,BCP 47 格式,如 zh-CN'),
  timeZone: z.string().optional().describe('IANA 时区,如 Asia/Shanghai'),

  // 偏好
  tone: z.string().optional().describe('用户偏好的沟通语气'),
  verbosity: z
    .enum(['concise', 'balanced', 'detailed'])
    .optional()
    .describe('用户偏好的回答详略程度'),
  responseFormat: z.array(z.string()).optional().describe('偏好的输出形式'),
  avoid: z.array(z.string()).optional().describe('明确不希望出现的做法或内容'),

  // 上下文:关注什么
  interests: z.array(z.string()).optional().describe('长期关注的领域与话题'),
  ongoingTasks: z.array(z.string()).optional().describe('当前正在进行的事'),
  toolchain: z.array(z.string()).optional().describe('常用的工具、平台与工作环境'),

  // 约定:与助手的默契
  conventions: z.array(z.string()).optional().describe('用户与助手达成的长期约定'),

  // 兜底
  notes: z.array(profileNoteSchema).optional().describe('无法归入上述字段的持久信息'),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

const PROFILE_NAMESPACE = ['profile'];
const PROFILE_KEY = 'profile';

// 从画像 schema 里自动抠出所有合法字段名，做成一张运行时白名单，在参数校验阶段，防止模型自己编造字段名
const PROFILE_FIELD_NAMES = Object.keys(userProfileSchema.shape) as [string, ...string[]];

function describeFieldType(fieldSchema: z.ZodType): string {
  const inner = fieldSchema instanceof z.ZodOptional ? fieldSchema.unwrap() : fieldSchema;
  if (inner instanceof z.ZodEnum) {
    return `枚举(${inner.options.join(' | ')})`;
  }
  if (inner instanceof z.ZodArray) {
    return inner.element instanceof z.ZodObject
      ? `对象数组(元素字段:${Object.keys(inner.element.shape).join('、')})`
      : '字符串数组';
  }
  return '字符串';
}

const PROFILE_FIELD_GUIDE = Object.entries(userProfileSchema.shape)
  .map(
    ([field, fieldSchema]) =>
      `- ${field}: ${fieldSchema.description ?? ''},类型为${describeFieldType(fieldSchema)}`,
  )
  .join('\n');

const patchOperationSchema = z.object({
  op: z
    .enum(['set', 'remove', 'append', 'removeFrom'])
    .describe('set 覆盖字段,remove 删除字段,append 往数组字段追加,removeFrom 从数组字段移除'),
  path: z.enum(PROFILE_FIELD_NAMES).describe('画像字段名,必须是给定字段清单中的一员'),
  value: z.unknown().optional().describe('set 时为字段新值,append/removeFrom 时为数组元素'),
});

export type ProfilePatch = z.infer<typeof patchOperationSchema>[];

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function applyPatch(profile: UserProfile, patch: ProfilePatch): UserProfile {
  const next = { ...profile } as Record<string, unknown>;
  for (const operation of patch) {
    switch (operation.op) {
      case 'set':
        next[operation.path] = operation.value;
        break;
      case 'remove':
        delete next[operation.path];
        break;
      case 'append': {
        const current = next[operation.path];
        const list: unknown[] = Array.isArray(current) ? [...(current as unknown[])] : [];
        if (!list.some((item) => sameValue(item, operation.value))) {
          list.push(operation.value);
        }
        next[operation.path] = list;
        break;
      }
      case 'removeFrom': {
        const current = next[operation.path];
        if (!Array.isArray(current)) {
          break;
        }
        next[operation.path] = current.filter((item) => !sameValue(item, operation.value));
        break;
      }
    }
  }
  return next;
}

export async function loadProfile(): Promise<UserProfile> {
  const item = await store.get(PROFILE_NAMESPACE, PROFILE_KEY);
  const parsed = userProfileSchema.safeParse(item?.value);
  return parsed.success ? parsed.data : {};
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await store.put(PROFILE_NAMESPACE, PROFILE_KEY, { ...profile });
}

export const updateProfileTool = tool(
  async ({ patch }) => {
    const merged = applyPatch(await loadProfile(), patch);
    const validated = userProfileSchema.safeParse(merged);
    if (!validated.success) {
      throw new Error(`画像更新后不符合 schema: ${validated.error.message}`);
    }
    await saveProfile(validated.data);
    return '用户画像已更新';
  },
  {
    name: 'update_profile',
    description: [
      '更新用户画像(长期记忆)。',
      '当用户透露了关于自己的持久信息时调用,例如称呼、职业、背景、偏好(语气/详略/输出格式/禁忌)、关注领域、正在做的事、常用工具,或与助手的长期约定。',
      '只提交新增或发生变化的部分,不要重写未变化的字段。',
      '可用字段:',
      PROFILE_FIELD_GUIDE,
      '无法归入这些字段的信息,用 op:"append"、path:"notes"、value:{"content":"..."}。',
    ].join('\n'),
    schema: z.object({
      patch: z.array(patchOperationSchema).describe('对画像的修改操作列表'),
    }),
  },
);

/** 把画像注入到系统提示里,让模型天然"记得"用户 */
export const profileMiddleware = createMiddleware({
  name: 'userProfile',
  wrapModelCall: async (request, handler) => {
    const profile = await loadProfile();
    if (Object.keys(profile).length === 0) {
      return handler(request);
    }
    const section = `\n\n<user_profile>\n${JSON.stringify(profile, null, 2)}\n</user_profile>`;
    return handler({ ...request, systemMessage: request.systemMessage.concat(section) });
  },
});
