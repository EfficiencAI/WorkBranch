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
import { toolRegistry } from './registry';
import type { ToolDefinition, ToolExecutionContext, ToolResult } from './types';

const noopExecutor = async (_args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> => ({ result: null, error: null });

function registerSpecialTools(): void {
  const specialTools: ToolDefinition[] = [
    {
      name: 'update_todo',
      description: '用完整列表覆盖更新 TODO 状态',
      params: 'update_todo:{"todos": ["(todo内容1)", "(todo内容2)"...],"doingIdx": (当前todo进行到第几项了，从0开始数)}',
      category: 'todo',
      executor: noopExecutor,
    },
    {
      name: 'switch_execution_mode',
      description: '切换当前执行模式',
      params: 'switch_execution_mode:{"mode":"PLAN","reason":"(为什么需要切到PLAN)"}',
      category: 'mode',
      executor: noopExecutor,
    },
    {
      name: 'call_explore_agent',
      description: '调用探索子代理',
      params: 'call_explore_agent:{"task_description":"(交给探索子代理的任务描述)"}',
      category: 'agent',
      executor: noopExecutor,
    },
    {
      name: 'call_review_agent',
      description: '调用审查子代理',
      params: 'call_review_agent:{"task_description":"(交给审查子代理的任务描述)"}',
      category: 'agent',
      executor: noopExecutor,
    },
  ];
  for (const tool of specialTools) {
    toolRegistry.register(tool);
  }
}

export function initializeTools(): void {
  registerFileTools();
  registerPlanTools();
  registerExploreTools();
  registerThinkingTool();
  registerDocumentTools();
  registerChatTool();
  registerSpecialTools();
}
