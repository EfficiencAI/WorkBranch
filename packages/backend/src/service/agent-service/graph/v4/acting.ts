import type { AgentState, ToolCallSpec, ToolRecord } from '../../state/agent-state';
import { logger } from '../../../../core/logging';
import { runToolExecution } from '../subgraphs/tool-execution-graph';
import { recentResults } from './reasoning';

export const SUBAGENT_TOOLS = new Set(['call_explore_agent', 'call_review_agent']);

// 串行工具：子 agent 工具 + 写类工具（避免并行文件写冲突）
const SERIAL_TOOLS = new Set([
  'call_explore_agent',
  'call_review_agent',
  'write_file',
  'delete_file',
  'create_dir',
]);

function legacyHistory(toolRecords: ToolRecord[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const record of toolRecords) {
    if (!record || record.call_seq === undefined) continue;
    out.push({
      tool: record.tool_name,
      args: record.args || {},
      result: record.result || record.error || '',
    });
  }
  return out;
}

export interface ActingNodeOptions {
  llmService?: unknown;
  settingsService?: unknown;
  messageContext?: Record<string, unknown>;
  postExecuteHook?: (
    update: Partial<AgentState>,
    results: ToolRecord[],
    state: AgentState,
  ) => Partial<AgentState> | void;
  parallelism?: number;
}

function resolveParallelism(options: ActingNodeOptions): number {
  const fromSettings =
    options.settingsService && typeof (options.settingsService as { get?: unknown }).get === 'function'
      ? Number((options.settingsService as { get: (key: string) => unknown }).get('agent:tool_parallelism'))
      : Number.NaN;
  const value = Number.isFinite(fromSettings) && fromSettings > 0 ? fromSettings : options.parallelism ?? 3;
  return Math.max(1, Math.floor(value));
}

async function executeSingleCall(
  call: ToolCallSpec,
  state: AgentState,
  options: ActingNodeOptions,
): Promise<ToolRecord> {
  const callSeq = call.call_seq;
  const toolName = call.tool_name;
  const toolArgs = call.tool_args || {};
  const taskDescription =
    call.task_description ||
    String(toolArgs.task_description || toolArgs.description || state.current_user_message_text || '');
  const started = Date.now();
  const baseRecord: ToolRecord = { call_seq: callSeq, tool_name: toolName, args: toolArgs };

  const previousResults = recentResults(state.tool_records || []);
  const enhancedArgs: Record<string, unknown> = { ...toolArgs, previous_results: previousResults };

  const enhancedMessageContext: Record<string, unknown> = {
    ...(options.messageContext || {}),
    workspace_id: state.workspace_id,
    parent_chain_messages: state.parent_chain_messages || [],
    current_conversation_messages: state.current_conversation_messages || [],
    current_user_message_text: state.current_user_message_text || '',
  };

  let toolResult: {
    result: unknown;
    error: string | null;
    execution_mode?: string;
    mode_reason?: string;
  };
  try {
    toolResult = await runToolExecution({
      toolName,
      toolArgs: enhancedArgs,
      workspaceId: state.workspace_id,
      conversationId: (options.messageContext?.conversation_id as string) || undefined,
      messageId: (options.messageContext?.message_id as string) || undefined,
      agentType: state.agent_type || 'director_agent',
      previousCalls: legacyHistory(state.tool_records || []) as never,
      taskDescription,
      previousResults,
      messageContext: enhancedMessageContext,
    });
  } catch (err) {
    toolResult = { result: null, error: `${(err as Error).constructor.name}: ${String(err)}` };
  }

  const durationMs = Date.now() - started;
  const error = toolResult.error;
  return {
    ...baseRecord,
    status: error ? 'failed' : 'success',
    result: toolResult.result,
    error: error ?? undefined,
    duration_ms: durationMs,
    timestamp: new Date().toISOString(),
    ...(toolResult.execution_mode ? { execution_mode: toolResult.execution_mode } : {}),
    ...(toolResult.mode_reason ? { mode_reason: toolResult.mode_reason } : {}),
  };
}

async function runBatch(
  calls: ToolCallSpec[],
  state: AgentState,
  options: ActingNodeOptions,
): Promise<ToolRecord[]> {
  const results: ToolRecord[] = [];
  const serialCalls = calls.filter((call) => SERIAL_TOOLS.has(call.tool_name));
  const parallelCalls = calls.filter((call) => !SERIAL_TOOLS.has(call.tool_name));

  for (const call of serialCalls) {
    results.push(await executeSingleCall(call, state, options));
  }

  if (parallelCalls.length > 0) {
    const limit = resolveParallelism(options);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, parallelCalls.length) }, async () => {
      while (cursor < parallelCalls.length) {
        const index = cursor;
        cursor += 1;
        results.push(await executeSingleCall(parallelCalls[index], state, options));
      }
    });
    await Promise.all(workers);
  }

  results.sort((a, b) => (a.call_seq ?? 0) - (b.call_seq ?? 0));
  return results;
}

function applyTodoUpdate(results: ToolRecord[]): Partial<AgentState> {
  const update: Partial<AgentState> = {};
  for (const record of results) {
    if (record.tool_name !== 'update_todo' || record.status !== 'success') continue;
    const data = (record.result || {}) as Record<string, unknown>;
    if (data.todos !== undefined) update.todos = data.todos as never;
    if (data.current_todo_index !== undefined) {
      update.current_todo_index = Number(data.current_todo_index);
    }
    if (data.current_todo_goal !== undefined) update.current_todo_goal = data.current_todo_goal as never;
    if (data.current_todo_done_when !== undefined) {
      update.current_todo_done_when = data.current_todo_done_when as never;
    }
  }
  return update;
}

function applyModeUpdate(results: ToolRecord[]): Partial<AgentState> {
  const update: Partial<AgentState> = {};
  for (const record of results) {
    if (record.tool_name !== 'switch_execution_mode' || record.status !== 'success') continue;
    const mode = record.execution_mode;
    if (mode === 'PLAN' || mode === 'DIRECT') {
      update.execution_mode = mode;
      update.mode_reason = record.mode_reason || 'agent 主动切换执行模式';
    }
  }
  return update;
}

export function createActingNode(options: ActingNodeOptions = {}) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const batch = state.pending_batch || {};
    const calls = batch.calls || [];
    if (calls.length === 0) {
      logger.warn({ event: 'v4.acting.empty_batch' });
      return {
        pending_batch: null,
        acting_failures: [{ status: 'failed', error: '空批次' }],
        iteration_count: (state.iteration_count || 0) + 1,
        _route_target: 'reasoning',
      };
    }

    const roundNo = (state.iteration_count || 0) + 1;
    const workspaceId = state.workspace_id;
    const results = await runBatch(calls, state, options);

    const toolRecords: ToolRecord[] = [
      ...(state.tool_records || []),
      { round: roundNo, reason: batch.reason || '' },
      ...results,
    ];

    const newConv = [...(state.current_conversation_messages || [])];
    for (const record of results) {
      const content = `[工具执行: ${record.tool_name}]\n结果: ${record.result === null || record.result === undefined ? '' : String(record.result)}`;
      newConv.push({
        role: 'assistant',
        content: record.error ? `${content}\n错误: ${record.error}` : content,
      });
    }

    const failed = results.filter((r) => r.status === 'failed');
    const update: Partial<AgentState> = {
      tool_records: toolRecords,
      current_conversation_messages: newConv,
      iteration_count: roundNo,
      pending_batch: null,
      has_tool_use: false,
      pending_tools: [],
      acting_failures: failed.length > 0 ? failed : null,
      _route_target: 'reasoning',
    };

    Object.assign(update, applyTodoUpdate(results));
    Object.assign(update, applyModeUpdate(results));

    const chatResult = results.find(
      (r) => r.tool_name === 'chat' && r.status === 'success' && r.result,
    );
    if (chatResult) {
      update.final_reply = String(chatResult.result);
    }

    if (options.postExecuteHook) {
      try {
        const hookUpdate = options.postExecuteHook(update, results, state);
        if (hookUpdate) Object.assign(update, hookUpdate);
      } catch (err) {
        logger.warn({ event: 'v4.acting.post_execute_hook_failed', error: String(err) });
      }
    }

    logger.info({
      event: 'v4.acting.completed',
      workspace_id: workspaceId,
      round: roundNo,
      calls: results.length,
      failed: failed.length,
    });

    return update;
  };
}

export function routeAfterActing(state: AgentState): string {
  return state._route_target || 'reasoning';
}
