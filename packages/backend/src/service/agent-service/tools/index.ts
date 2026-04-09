export * from './registry';
export * from './file-tools';

import { registerFileTools } from './file-tools';

export function initializeTools(): void {
  registerFileTools();
}
