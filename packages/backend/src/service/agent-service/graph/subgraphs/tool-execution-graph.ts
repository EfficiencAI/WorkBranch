import { toolExecutor, type ToolExecutionContext } from '../../tools/executors';
import type { ToolCall } from '../../state/agent-state';
import { logger } from '../../../../core/logging';

const FILE_TOOLS = new Set(['read_file', 'write_file', 'delete_file', 'list_dir', 'create_dir']);

export interface ToolExecutionResult {
  tool_name: string;
  args: Record<string, unknown>;
  result: unknown;
  error: string | null;
}

export interface RunToolExecutionParams {
  toolName: string;
  toolArgs: Record<string, unknown>;
  workspaceId: string;
  conversationId?: string;
  messageId?: string;
  agentType?: string;
  previousCalls?: ToolCall[];
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
  } = params;

  logger.info({
    event: 'tool_execution.started',
    tool_name: toolName,
    workspace_id: workspaceId,
    agent_type: agentType,
    previous_calls_count: previousCalls.length,
  });

  const context: ToolExecutionContext = {
    workspace_id: workspaceId,
    conversation_id: conversationId || '',
    message_id: messageId || '',
    agent_type: agentType,
  };

  if (toolName in FILE_TOOLS) {
    logger.debug({
      event: 'tool_execution.file_tool',
      tool_name: toolName,
    });
  }

  const result = await toolExecutor.execute(toolName, toolArgs, context);

  logger.info({
    event: 'tool_execution.completed',
    tool_name: toolName,
    success: result.error === null,
  });

  return {
    tool_name: toolName,
    args: toolArgs,
    result: result.result,
    error: result.error,
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
