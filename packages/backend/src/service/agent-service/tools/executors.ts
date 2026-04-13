import type { ToolResult, ToolExecutionContext } from './types';
import { toolRegistry } from './registry';
import { workspaceService } from '../service/workspace-service';
import { logger } from '../../../core/logging';
import * as path from 'path';

export type { ToolExecutionContext };

export function resolveWorkspacePath(workspaceId: string, relativePath: string): { valid: boolean; path?: string; error?: string } {
  const workspaceDir = workspaceService.getWorkspaceDir(workspaceId);
  if (!workspaceDir) {
    return { valid: false, error: `Workspace not found: ${workspaceId}` };
  }

  if (path.isAbsolute(relativePath)) {
    return { valid: false, error: `Absolute paths are not allowed. Use relative paths within the workspace.` };
  }

  const fullPath = path.join(workspaceDir, relativePath);
  const normalizedPath = path.normalize(fullPath);
  const normalizedWorkspace = path.normalize(workspaceDir);

  if (!normalizedPath.startsWith(normalizedWorkspace + path.sep) && normalizedPath !== normalizedWorkspace) {
    return { valid: false, error: `Path traversal detected. Path must be within the workspace.` };
  }

  return { valid: true, path: normalizedPath };
}

export function resolveWorkspacePathStrict(workspaceId: string, relativePath: string): { valid: boolean; path?: string; error: string | null } {
  const result = resolveWorkspacePath(workspaceId, relativePath);
  return {
    valid: result.valid,
    path: result.path,
    error: result.error ?? null,
  };
}

export function getWorkspaceDir(workspaceId: string): string | null {
  return workspaceService.getWorkspaceDir(workspaceId);
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

      const result = await tool.executor(args, context);

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
