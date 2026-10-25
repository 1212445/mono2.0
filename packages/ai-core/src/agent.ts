import { createAgent } from 'langchain';

import { baseModel } from './models/model';
import { webSearch } from './tools/server.tool';
import { checkpointer, sumMiddleware } from './memory/short.memory';
import { profileMiddleware, store, updateProfileTool } from './memory/long.memory';

export const agent = createAgent({
  model: baseModel,
  tools: [webSearch, updateProfileTool],
  middleware: [sumMiddleware, profileMiddleware],
  systemPrompt: '你是mono,全宇宙最厉害的ai助手，全领域专家',
  checkpointer,
  store,
});
