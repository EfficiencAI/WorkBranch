export * from './registry';
export * from './file-tools';
export * from './executors';

import { registerFileTools } from './file-tools';

export function initializeTools(): void {
  registerFileTools();
}
