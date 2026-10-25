import { ChatAnthropic } from '@langchain/anthropic';
import type { ModelProfile } from '@langchain/core/language_models/profile';

const apiKey = process.env.MINIMAX_API_KEY;
const model = process.env.MINIMAX_MODEL;
const anthropicApiUrl = process.env.MINIMAX_URL;
const maxInputTokens = Number(process.env.MINIMAX_MAX_INPUT_TOKEN);

// 设置模型上下文窗口 1M
class MiniMaxChatAnthropic extends ChatAnthropic {
  override get profile(): ModelProfile {
    return { ...super.profile, maxInputTokens };
  }
}

export const baseModel = new MiniMaxChatAnthropic({
  model,
  apiKey,
  anthropicApiUrl,
  maxTokens: 131072, // 官方推荐 128K
  maxRetries: 6,
  thinking: { type: 'adaptive' },
  outputConfig: { effort: 'medium' },
});
