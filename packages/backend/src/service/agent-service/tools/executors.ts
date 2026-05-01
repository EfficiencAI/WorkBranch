import type { ToolResult, ToolExecutionContext } from './types';
import { toolRegistry } from './registry';
import { workspaceService } from '../service/workspace-service';
import { SegmentType } from '../../session-service/canonical';
import { writeToolEvent, isSpecialTool } from '../graph/subgraphs/tool-registry';
import { logger } from '../../../core/logging';
import * as path from 'path';

export type { ToolExecutionContext };

const PLAN_MODE_TOOLS = new Set([
  'enter_plan_mode',
  'exit_plan_mode',
  'update_plan',
  'execute_plan',
]);

const AGENT_TOOLS = new Set([
  'spawn_agent',
  'send_message_to_agent',
  'stop_agent',
  'list_agents',
]);

const TODO_TOOLS = new Set([
  'update_todo',
]);

const MODE_SWITCH_TOOLS = new Set([
  'switch_execution_mode',
]);

const DANGEROUS_TOOLS = new Set([
  'delete_file',
  'execute_command',
  'modify_system',
]);

const TOOL_EXECUTION_TIMEOUT_MS = 30000;
const SPECIAL_TOOL_TIMEOUT_MS = 120000;

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

export function isPlanModeTool(toolName: string): boolean {
  return PLAN_MODE_TOOLS.has(toolName);
}

export function isAgentTool(toolName: string): boolean {
  return AGENT_TOOLS.has(toolName);
}

export function isTodoTool(toolName: string): boolean {
  return TODO_TOOLS.has(toolName);
}

export function isModeSwitchTool(toolName: string): boolean {
  return MODE_SWITCH_TOOLS.has(toolName);
}

export function isDangerousTool(toolName: string): boolean {
  return DANGEROUS_TOOLS.has(toolName);
}

export function checkPermission(
  toolName: string,
  toolArgs: Record<string, unknown>,
  workspaceId: string,
  _agentType?: string,
  autoApprove?: boolean
): { permission: 'allow' | 'deny' | 'ask'; error?: string } {
  if (PLAN_MODE_TOOLS.has(toolName) || AGENT_TOOLS.has(toolName) || TODO_TOOLS.has(toolName) || MODE_SWITCH_TOOLS.has(toolName)) {
    return { permission: 'allow' };
  }

  if (DANGEROUS_TOOLS.has(toolName) && !autoApprove) {
    return { permission: 'ask' };
  }

  const pathKey = 'path' in toolArgs ? 'path' : 'file_path';
  const targetPath = toolArgs[pathKey] as string | undefined || toolArgs['directory'] as string | undefined;

  if (targetPath) {
    const pathResult = resolveWorkspacePath(workspaceId, targetPath);
    if (!pathResult.valid) {
      return { permission: 'deny', error: pathResult.error };
    }
  }

  return { permission: 'allow' };
}

function buildToolFailureResult(
  toolName: string,
  error: string,
  options?: {
    messageContext?: Record<string, unknown>;
    conversationId?: string;
    taskDescription?: string;
  },
): ToolResult {
  if (options?.messageContext) {
    const sendMessage = options.messageContext.send_message as
      ((content: string, type: SegmentType, metadata?: Record<string, unknown>) => Promise<void>) | undefined;
    if (sendMessage && !isSpecialTool(toolName)) {
      sendMessage('', SegmentType.TOOL_RES, {
        tool_name: toolName,
        result: null,
        error,
        success: false,
      }).catch(() => {});
    }
  }

  writeToolEvent(
    options?.conversationId,
    toolName,
    'failed',
    { taskDescription: options?.taskDescription, error },
  );

  return { result: null, error };
}

export class ToolExecutor {
  private currentMode: 'normal' | 'plan' = 'normal';
  private currentPlan: Array<{ description: string; tool?: string; args?: Record<string, unknown> }> = [];

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
    messageContext?: Record<string, unknown>,
  ): Promise<ToolResult> {
    logger.info({
      event: 'tool.execute.started',
      tool_name: toolName,
      workspace_id: context.workspace_id,
      agent_type: context.agent_type,
    });

    const sendMessage = messageContext?.send_message as
      ((content: string, type: SegmentType, metadata?: Record<string, unknown>) => Promise<void>) | undefined;
    const conversationId = messageContext?.conversation_id as string | undefined;
    const taskDescription = args.task_description as string || args.description as string || '';

    try {
      if (PLAN_MODE_TOOLS.has(toolName)) {
        return await this.executePlanModeTool(toolName, args, context);
      }

      if (AGENT_TOOLS.has(toolName)) {
        return await this.executeAgentTool(toolName, args, context);
      }

      if (TODO_TOOLS.has(toolName)) {
        return await this.executeTodoTool(toolName, args, context);
      }

      if (MODE_SWITCH_TOOLS.has(toolName)) {
        return this.executeModeSwitchTool(toolName, args);
      }

      if (sendMessage && !isSpecialTool(toolName)) {
        await sendMessage('', SegmentType.TOOL_CALL, {
          tool_name: toolName,
          tool_args: args,
          task_description: taskDescription,
        });
      }

      writeToolEvent(conversationId, toolName, 'started', { taskDescription });

      const tool = toolRegistry.get(toolName);

      if (!tool) {
        const error = `Unknown tool: ${toolName}`;
        logger.error({
          event: 'tool.execute.failed',
          tool_name: toolName,
          error,
        });
        return buildToolFailureResult(toolName, error, {
          messageContext,
          conversationId,
          taskDescription,
        });
      }

      const resolvedArgs = this.resolveToolArgs(toolName, args, context);

      const timeoutMs = isSpecialTool(toolName) ? SPECIAL_TOOL_TIMEOUT_MS : TOOL_EXECUTION_TIMEOUT_MS;
      const result = await this.executeWithTimeout(tool.executor(resolvedArgs, context), timeoutMs, toolName);

      if (sendMessage && !isSpecialTool(toolName)) {
        const resultContent = result.result;
        let resultPreview = '';
        if (resultContent !== null && resultContent !== undefined) {
          resultPreview = String(resultContent);
          if (resultPreview.length > 500) {
            resultPreview = resultPreview.slice(0, 500) + '...';
          }
        }
        await sendMessage('', SegmentType.TOOL_RES, {
          tool_name: toolName,
          result: resultPreview,
          error: result.error,
          success: result.error === null,
        });
      }

      if (result.error === null) {
        writeToolEvent(conversationId, toolName, 'completed', {
          taskDescription,
          result: result.result ? String(result.result).slice(0, 200) : '',
        });
      } else {
        writeToolEvent(conversationId, toolName, 'failed', {
          taskDescription,
          error: result.error,
        });
      }

      if (result.error === null) {
        if (result.result === null || result.result === undefined) {
          result.result = '[工具没有返回内容]';
        } else if (result.result === '') {
          result.result = '[工具返回内容为空]';
        }
      }

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
      return buildToolFailureResult(toolName, error, {
        messageContext,
        conversationId,
        taskDescription,
      });
    }
  }

  private async executeWithTimeout(
    promise: Promise<ToolResult>,
    timeoutMs: number,
    toolName: string,
  ): Promise<ToolResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await promise;
    } catch (err) {
      if (controller.signal.aborted) {
        logger.error({ event: 'tool.execute.timeout', tool_name: toolName, timeout_ms: timeoutMs });
        return { result: null, error: `工具 ${toolName} 执行超时（${timeoutMs / 1000}秒）` };
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private resolveToolArgs(_toolName: string, args: Record<string, unknown>, context: ToolExecutionContext): Record<string, unknown> {
    const resolved = { ...args };

    if ('file_name' in resolved && !('file_path' in resolved) && !('path' in resolved)) {
      resolved['file_path'] = resolved['file_name'];
      delete resolved['file_name'];
    }
    if ('file_content' in resolved && !('content' in resolved)) {
      resolved['content'] = resolved['file_content'];
      delete resolved['file_content'];
    }

    const pathKey = 'path' in resolved ? 'path' : 'file_path';
    const targetPath = resolved[pathKey] as string | undefined || resolved['directory'] as string | undefined;

    if (targetPath && typeof targetPath === 'string') {
      const pathResult = resolveWorkspacePath(context.workspace_id, targetPath);
      if (pathResult.valid && pathResult.path) {
        if (pathKey in resolved) {
          resolved['path'] = pathResult.path;
        } else if ('file_path' in resolved) {
          resolved['file_path'] = pathResult.path;
        } else if ('directory' in resolved) {
          resolved['directory'] = pathResult.path;
        }
      }
    }

    return resolved;
  }

  private async executePlanModeTool(toolName: string, args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    switch (toolName) {
      case 'enter_plan_mode': {
        this.currentMode = 'plan';
        const taskDescription = args['task_description'] as string || '';
        const maxSteps = args['max_steps'] as number || 5;

        return {
          result: {
            status: 'entered_plan_mode',
            task_description: taskDescription,
            max_steps: maxSteps,
            message: `已进入规划模式`,
          },
          error: null,
        };
      }

      case 'exit_plan_mode': {
        this.currentMode = 'normal';
        this.currentPlan = [];
        return {
          result: {
            status: 'exited_plan_mode',
            message: '已退出规划模式',
          },
          error: null,
        };
      }

      case 'update_plan': {
        const tasks = args['tasks'] as Array<{ description: string; tool?: string; args?: Record<string, unknown> }> || [];
        this.currentPlan = tasks;
        return {
          result: {
            status: 'plan_updated',
            plan: tasks,
            message: `规划已更新，包含 ${tasks.length} 个任务`,
          },
          error: null,
        };
      }

      case 'execute_plan': {
        const results: Array<{ task: Record<string, unknown>; result: unknown }> = [];

        for (const task of this.currentPlan) {
          if (task.tool) {
            const taskResult = await this.execute(task.tool, task.args || {}, _context);
            results.push({ task, result: taskResult });
          } else {
            results.push({ task, result: { status: 'completed', message: '思考完成' } });
          }
        }

        this.currentMode = 'normal';
        this.currentPlan = [];

        return {
          result: {
            status: 'plan_executed',
            results,
            message: `规划执行完成，共 ${results.length} 个任务`,
          },
          error: null,
        };
      }

      default:
        return { result: null, error: `Unknown plan mode tool: ${toolName}` };
    }
  }

  private async executeAgentTool(toolName: string, args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
    switch (toolName) {
      case 'spawn_agent': {
        const agentType = args['agent_type'] as string || 'general-purpose';
        const task = args['task_description'] as string || '';
        return {
          result: {
            status: 'agent_spawned',
            agent_type: agentType,
            task,
            message: `Agent ${agentType} 已启动`,
          },
          error: null,
        };
      }

      case 'send_message_to_agent': {
        const agentId = args['agent_id'] as string;
        const message = args['message'] as string || '';
        if (!agentId) {
          return { result: null, error: 'agent_id is required' };
        }
        return {
          result: {
            status: 'message_sent',
            agent_id: agentId,
            message,
          },
          error: null,
        };
      }

      case 'stop_agent': {
        const agentId = args['agent_id'] as string;
        if (!agentId) {
          return { result: null, error: 'agent_id is required' };
        }
        return {
          result: {
            status: 'agent_stopped',
            agent_id: agentId,
            message: `Agent ${agentId} 已停止`,
          },
          error: null,
        };
      }

      case 'list_agents': {
        return {
          result: {
            status: 'agents_listed',
            agents: [],
            count: 0,
          },
          error: null,
        };
      }

      default:
        return { result: null, error: `Unknown agent tool: ${toolName}` };
    }
  }

  private async executeTodoTool(toolName: string, args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    if (toolName === 'update_todo') {
      const { updateTodo } = await import('./todo-tools');
      const todos = args['todos'] as Array<Record<string, unknown>> || [];
      const doingIdx = args['doingIdx'] as number || 0;

      const result = updateTodo(context.workspace_id, {
        todos: todos as any[],
        doingIdx,
      });

      return {
        result: {
          success: result.success,
          todos: result.todos,
          current_todo_index: result.current_todo_index,
          current_todo_goal: result.current_todo_goal,
          current_todo_done_when: result.current_todo_done_when,
        },
        error: null,
      };
    }

    return { result: null, error: `Unknown todo tool: ${toolName}` };
  }

  private executeModeSwitchTool(toolName: string, args: Record<string, unknown>): ToolResult {
    if (toolName === 'switch_execution_mode') {
      const mode = (args['mode'] as string || '').toLowerCase();
      const reason = args['reason'] as string || 'agent 决定切换执行模式';

      if (mode !== 'plan' && mode !== 'direct') {
        return { result: null, error: `无效的 mode: ${mode}` };
      }

      return {
        result: `已切换执行模式为 ${mode}`,
        error: null,
        execution_mode: mode as 'plan' | 'direct',
        mode_reason: reason,
      } as ToolResult & { execution_mode: string; mode_reason: string };
    }

    return { result: null, error: `Unknown mode switch tool: ${toolName}` };
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
