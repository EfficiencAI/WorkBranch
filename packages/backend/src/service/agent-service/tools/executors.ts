import type { ToolResult } from './registry';
import { toolRegistry } from './registry';
import { logger } from '../../../core/logging';

export interface ToolExecutionContext {
  workspace_id: string;
  conversation_id: string;
  message_id: string;
  agent_type?: string;
}

export class ToolExecutor {
  private currentMode: 'normal' | 'plan' = 'normal';
  private currentPlan: Array<{ description: string; tool?: string; args?: Record<string, unknown> }> = [];

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    logger.info({
      event: 'tool.execute.started',
      tool_name: toolName,
      workspace_id: context.workspace_id,
      agent_type: context.agent_type,
    });

    try {
      const tool = toolRegistry.get(toolName);

      if (!tool) {
        const error = `Unknown tool: ${toolName}`;
        logger.error({
          event: 'tool.execute.failed',
          tool_name: toolName,
          error,
        });
        return { result: null, error };
      }

      const result = await tool.executor(args);

      logger.info({
        event: 'tool.execute.completed',
        tool_name: toolName,
        success: result.error === null,
      });

      return result;
    } catch (err) {
      const error = String(err);
      logger.error({
        event: 'tool.execute.error',
        tool_name: toolName,
        error,
      });
      return { result: null, error };
    }
  }

  getCurrentMode(): 'normal' | 'plan' {
    return this.currentMode;
  }

  setCurrentMode(mode: 'normal' | 'plan'): void {
    this.currentMode = mode;
    if (mode === 'normal') {
      this.currentPlan = [];
    }
  }

  getCurrentPlan(): Array<{ description: string; tool?: string; args?: Record<string, unknown> }> {
    return this.currentPlan;
  }

  setPlan(plan: Array<{ description: string; tool?: string; args?: Record<string, unknown> }>): void {
    this.currentPlan = plan;
  }
}

export const toolExecutor = new ToolExecutor();
