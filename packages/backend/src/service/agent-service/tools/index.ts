export * from './registry';
export * from './file-tools';
export * from './executors';
export * from './plan-tools';
export * from './explore-tools';
export * from './thinking';
export * from './document-tools';
export * from './chat';
export * from './agent-tools';
export * from './subagent-tools';

import { registerFileTools } from './file-tools';
import { registerPlanTools } from './plan-tools';
import { registerExploreTools } from './explore-tools';
import { registerThinkingTool } from './thinking';
import { registerDocumentTools } from './document-tools';
import { registerChatTool } from './chat';
import { registerAgentTools } from './agent-tools';
import { registerSubagentTools } from './subagent-tools';
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
      name: 'enter_plan_mode',
      description: '进入规划模式',
      params: 'enter_plan_mode:{"task_description":"(任务描述)","max_steps":5}',
      category: 'plan',
      executor: noopExecutor,
    },
    {
      name: 'exit_plan_mode',
      description: '退出规划模式',
      params: 'exit_plan_mode:{}',
      category: 'plan',
      executor: noopExecutor,
    },
    {
      name: 'update_plan',
      description: '更新执行计划',
      params: 'update_plan:{"tasks":[{"description":"(步骤描述)","tool":"(工具名)","args":{}}]}',
      category: 'plan',
      executor: noopExecutor,
    },
    {
      name: 'execute_plan',
      description: '执行当前计划',
      params: 'execute_plan:{}',
      category: 'plan',
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
  registerAgentTools();
  registerSubagentTools();
  registerSpecialTools();
}
