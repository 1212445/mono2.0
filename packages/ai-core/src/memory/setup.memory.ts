import { setupCheckpointer } from './short.memory';
import { setupStore } from './long.memory';

export async function setupMemory(): Promise<void> {
  await Promise.all([setupCheckpointer(), setupStore()]);
}
