import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { summarizationMiddleware } from 'langchain';

import { baseModel } from '../models/model';

const user = process.env.POSTGRES_USER;
const password = process.env.POSTGRES_PASSWORD;
const host = process.env.POSTGRES_HOST;
const port = process.env.POSTGRES_PORT;
const db = process.env.POSTGRES_DB;
const schema = process.env.POSTGRES_SCHEMA;

export const checkpointer = PostgresSaver.fromConnString(
  `postgresql://${user}:${password}@${host}:${port}/${db}`,
  {
    schema,
  },
);

export async function setupCheckpointer(): Promise<void> {
  await checkpointer.setup();
}

// 摘要信息
export const sumMiddleware = summarizationMiddleware({
  model: baseModel,
  trigger: { fraction: 0.8 },
  keep: { messages: 5 },
});
