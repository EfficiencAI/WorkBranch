export * from './registry';
export * from './file-tools';
export * from './executors';
export * from './plan-tools';
export * from './explore-tools';
export * from './thinking';
export * from './document-tools';
export * from './chat';

import { registerFileTools } from './file-tools';
import { registerPlanTools } from './plan-tools';
import { registerExploreTools } from './explore-tools';
import { registerThinkingTool } from './thinking';
import { registerDocumentTools } from './document-tools';
import { registerChatTool } from './chat';

export function initializeTools(): void {
  registerFileTools();
  registerPlanTools();
  registerExploreTools();
  registerThinkingTool();
  registerDocumentTools();
  registerChatTool();
}
