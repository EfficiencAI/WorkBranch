import { StateGraph, END } from '@langchain/langgraph';
import { toolExecutor, checkPermission, type ToolExecutionContext } from '../../tools/executors';
import type { ToolCall } from '../../state/agent-state';
import type { ToolExecutionState } from '../../state/subgraph-states';
import { isSpecialTool, writeToolEvent, FILE_TOOLS as REGISTRY_FILE_TOOLS, EXPLORE_TOOLS, WORKSPACE_TOOLS } from './tool-registry';
import { SegmentType } from '../../../session-service/canonical';
import { logger } from '../../../../core/logging';
import { workspaceService } from '../../service/workspace-service';

const FILE_TOOLS = new Set(['read_file', 'write_file', 'delete_file', 'list_dir', 'create_dir', 'read_document']);

const TOOL_EXECUTION_TIMEOUT_MS = 30000;
const SPECIAL_TOOL_TIMEOUT_MS = 120000;

export interface ToolExecutionResult {
  tool_name: string;
  args: Record<string, unknown>;
  result: unknown;
  error: string | null;
  execution_mode?: string;
  mode_reason?: string;
}

export interface RunToolExecutionParams {
  toolName: string;
  toolArgs: Record<string, unknown>;
  workspaceId: string;
  conversationId?: string;
  messageId?: string;
  agentType?: string;
  previousCalls?: ToolCall[];
  taskDescription?: string;
  previousResults?: string[];
  autoApprove?: boolean;
  messageContext?: Record<string, unknown>;
}

const ToolExecutionStateChannels = {
  tool_name: { value: (_a: unknown, b: unknown) => b, default: () => '' },
  tool_args: { value: (_a: unknown, b: unknown) => b, default: () => ({}) },
  workspace_id: { value: (_a: unknown, b: unknown) => b, default: () => '' },
  permission: { value: (_a: unknown, b: unknown) => b, default: () => 'pending' },
  result: { value: (_a: unknown, b: unknown) => b, default: () => null },
  error: { value: (_a: unknown, b: unknown) => b, default: () => null },
  doom_loop_detected: { value: (_a: unknown, b: unknown) => b, default: () => false },
  previous_calls: { value: (a: unknown[], b: unknown[]) => a.concat(b), default: () => [] },
  task_description: { value: (_a: unknown, b: unknown) => b, default: () => '' },
  previous_results: { value: (a: unknown[], b: unknown[]) => a.concat(b), default: () => [] },
  agent_type: { value: (_a: unknown, b: unknown) => b, default: () => 'director_agent' },
  auto_approve: { value: (_a: unknown, b: unknown) => b, default: () => false },
  execution_mode: { value: (_a: unknown, b: unknown) => b, default: () => '' },
  mode_reason: { value: (_a: unknown, b: unknown) => b, default: () => '' },
};

function checkPermissionNode(state: ToolExecutionState): Partial<ToolExecutionState> {
  const toolName = state.tool_name;
  const toolArgs = state.tool_args;
  const workspaceId = state.workspace_id;
  const agentType = state.agent_type || 'director_agent';
  const autoApprove = state.auto_approve || false;

  logger.info({
    event: 'tool_execution.check_permission',
    tool_name: toolName,
    workspace_id: workspaceId,
    agent_type: agentType,
  });

  const permResult = checkPermission(toolName, toolArgs, workspaceId, agentType, autoApprove);

  if (permResult.permission === 'deny') {
    logger.error({ event: 'tool_execution.permission_denied', tool_name: toolName, error: permResult.error });
    return {
      permission: 'deny',
      error: permResult.error || 'Permission denied',
    } as Partial<ToolExecutionState>;
  }

  if (permResult.permission === 'ask') {
    logger.warn({ event: 'tool_execution.permission_ask', tool_name: toolName });
    return { permission: 'ask' } as Partial<ToolExecutionState>;
  }

  logger.info({ event: 'tool_execution.permission_allowed', tool_name: toolName });
  return { permission: 'allow' } as Partial<ToolExecutionState>;
}

function routeByPermission(state: ToolExecutionState): 'execute' | 'ask_user' | 'deny' {
  const perm = state.permission;
  if (perm === 'allow') return 'execute';
  if (perm === 'ask') return 'ask_user';
  if (perm === 'deny') return 'deny';
  logger.error({ event: 'tool_execution.unknown_permission', permission: perm });
  return 'deny';
}

function askUserNode(_state: ToolExecutionState): Partial<ToolExecutionState> {
  logger.info({ event: 'tool_execution.ask_user', message: 'Auto-approving (same as reference project)' });
  return { permission: 'allow' } as Partial<ToolExecutionState>;
}

function denyExecutionNode(state: ToolExecutionState): Partial<ToolExecutionState> {
  logger.error({ event: 'tool_execution.denied', tool_name: state.tool_name });
  return {
    error: state.error || 'Permission denied',
    result: null,
  } as Partial<ToolExecutionState>;
}

function checkDoomLoop(state: ToolExecutionState): Partial<ToolExecutionState> {
  const toolName = state.tool_name;
  const toolArgs = state.tool_args;
  const previousCalls = state.previous_calls || [];

  let duplicateCount = 0;
  for (const call of previousCalls) {
    if (call.tool === toolName && JSON.stringify(call.args) === JSON.stringify(toolArgs)) {
      duplicateCount++;
    }
  }

  if (duplicateCount >= 3) {
    logger.error({ event: 'tool_execution.doom_loop_detected', tool_name: toolName });
    return { doom_loop_detected: true, error: 'DoomLoop detected' } as Partial<ToolExecutionState>;
  }

  return { doom_loop_detected: false } as Partial<ToolExecutionState>;
}

function createExecuteNode(messageContext?: Record<string, unknown>) {
  return async (state: ToolExecutionState): Promise<Partial<ToolExecutionState>> => {
    const toolName = state.tool_name;
    const toolArgs = { ...state.tool_args };
    const workspaceId = state.workspace_id;
    const agentType = state.agent_type || 'build_agent';

    logger.info({
      event: 'tool_execution.started',
      tool_name: toolName,
      workspace_id: workspaceId,
      agent_type: agentType,
    });

    if ('file_name' in toolArgs && !('file_path' in toolArgs) && !('path' in toolArgs)) {
      toolArgs['file_path'] = toolArgs['file_name'];
      delete toolArgs['file_name'];
    }
    if ('file_content' in toolArgs && !('content' in toolArgs)) {
      toolArgs['content'] = toolArgs['file_content'];
      delete toolArgs['file_content'];
    }

    if (FILE_TOOLS.has(toolName)) {
      const pathKey = 'path' in toolArgs ? 'path' : 'file_path';
      const targetPath = toolArgs[pathKey] as string | undefined || toolArgs['directory'] as string | undefined;

      if (targetPath) {
        const resolved = workspaceService.resolvePath(workspaceId, targetPath);
        if (!resolved.valid) {
          logger.error({ event: 'tool_execution.path_validate_failed', tool_name: toolName, error: resolved.error });
          return {
            result: null,
            error: resolved.error || '路径验证失败',
          } as Partial<ToolExecutionState>;
        }
        logger.info({ event: 'tool_execution.path_validated', tool_name: toolName, raw_path: targetPath });
      }
    }

    if (EXPLORE_TOOLS.has(toolName)) {
      const workspaceRoot = workspaceService.getWorkspaceDir(workspaceId);
      if (workspaceRoot) {
        toolArgs['workspace_root'] = workspaceRoot;
        logger.info({ event: 'tool_execution.explore_workspace_root', tool_name: toolName, workspace_root: workspaceRoot });
      }
    }

    const context: ToolExecutionContext = {
      workspace_id: workspaceId,
      conversation_id: (messageContext?.conversation_id as string) || '',
      message_id: (messageContext?.message_id as string) || '',
      agent_type: agentType,
    };

    const result = await toolExecutor.execute(toolName, toolArgs, context, messageContext);

    logger.info({
      event: 'tool_execution.completed',
      tool_name: toolName,
      success: result.error === null,
    });

    const update: Partial<ToolExecutionState> = {
      result: result.result as string,
      error: result.error,
    } as Partial<ToolExecutionState>;

    if ((result as any).execution_mode) {
      update.execution_mode = (result as any).execution_mode;
      update.mode_reason = (result as any).mode_reason || '';
    }

    return update;
  };
}

function createToolExecutionGraph(messageContext?: Record<string, unknown>) {
  const graph = new StateGraph({
    channels: ToolExecutionStateChannels,
  } as any);

  graph.addNode('check_permission', checkPermissionNode);
  graph.addNode('ask_user', askUserNode);
  graph.addNode('deny', denyExecutionNode);
  graph.addNode('execute', createExecuteNode(messageContext));
  graph.addNode('doom_loop_check', checkDoomLoop);

  graph.setEntryPoint('check_permission');

  (graph as any).addConditionalEdges('check_permission', routeByPermission, {
    execute: 'execute',
    ask_user: 'ask_user',
    deny: 'deny',
  });

  graph.addEdge('ask_user', 'execute');
  graph.addEdge('execute', 'doom_loop_check');
  graph.addEdge('doom_loop_check', END);
  graph.addEdge('deny', END);

  return graph.compile();
}

export async function runToolExecution(params: RunToolExecutionParams): Promise<ToolExecutionResult> {
  const {
    toolName,
    toolArgs,
    workspaceId,
    conversationId,
    messageId,
    agentType = 'build_agent',
    previousCalls = [],
    taskDescription = '',
    previousResults = [],
    autoApprove = false,
    messageContext,
  } = params;

  logger.info({
    event: 'tool_execution.subgraph_started',
    tool_name: toolName,
    workspace_id: workspaceId,
    agent_type: agentType,
    previous_calls_count: previousCalls.length,
  });

  const initialState: ToolExecutionState = {
    tool_name: toolName,
    tool_args: toolArgs,
    workspace_id: workspaceId,
    permission: 'pending',
    result: '',
    error: '',
    doom_loop_detected: false,
    previous_calls: previousCalls,
    task_description: taskDescription,
    previous_results: previousResults,
    agent_type: agentType,
    auto_approve: autoApprove,
    execution_mode: '',
    mode_reason: '',
  };

  const graph = createToolExecutionGraph(messageContext);

  const timeoutMs = isSpecialTool(toolName) ? SPECIAL_TOOL_TIMEOUT_MS : TOOL_EXECUTION_TIMEOUT_MS;

  let result: ToolExecutionState;
  try {
    result = await Promise.race([
      graph.invoke(initialState) as Promise<ToolExecutionState>,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`工具 ${toolName} 执行超时（${timeoutMs / 1000}秒）`)), timeoutMs)
      ),
    ]);
  } catch (err) {
    const errorMsg = String(err);
    logger.error({ event: 'tool_execution.subgraph_failed', tool_name: toolName, error: errorMsg });

    if (messageContext) {
      const sendMessage = messageContext.send_message as
        ((content: string, type: SegmentType, metadata?: Record<string, unknown>) => Promise<void>) | undefined;
      if (sendMessage && !isSpecialTool(toolName)) {
        await sendMessage('', SegmentType.TOOL_RES, {
          tool_name: toolName,
          result: null,
          error: errorMsg,
          success: false,
        }).catch(() => {});
      }
    }

    writeToolEvent(conversationId, toolName, 'failed', { taskDescription, error: errorMsg });

    return {
      tool_name: toolName,
      args: toolArgs,
      result: null,
      error: errorMsg,
    };
  }

  logger.info({
    event: 'tool_execution.subgraph_completed',
    tool_name: toolName,
    success: !result.error,
  });

  return {
    tool_name: toolName,
    args: toolArgs,
    result: result.result,
    error: result.error || null,
    execution_mode: result.execution_mode || undefined,
    mode_reason: result.mode_reason || undefined,
  };
}

export function isFileTool(toolName: string): boolean {
  return FILE_TOOLS.has(toolName);
}

export function getToolCategory(toolName: string): string {
  if (FILE_TOOLS.has(toolName)) {
    return 'file';
  }
  return 'general';
}
