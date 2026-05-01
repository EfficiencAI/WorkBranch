import { StateGraph, END } from '@langchain/langgraph';
import type { AgentState, ToolCall } from '../state/agent-state';
import type { MessageContext } from './director-agent/director-agent';
import { createOrchestratorGraphV3, getLastUserMessageText } from './director-agent/director-agent';
import { runToolExecution } from './subgraphs/tool-execution-graph';
import { SegmentType } from '../../session-service/canonical';
import { persistence } from './orchestrator-v2';
import { logger } from '../../../core/logging';

export interface AgentOutcome {
  kind: 'graph';
  agent_type: string;
  status: 'completed' | 'failed';
  payload: string | null;
  produced_user_reply: boolean;
  exit_info: {
    code: string;
    message: string | null;
    details: Record<string, unknown>;
  };
  final_state: AgentState;
}

export function buildAgentOutcome(agentType: string, finalState: AgentState): AgentOutcome {
  const finalReply = finalState.final_reply;
  const error = finalState.last_tool_error;

  if (error && !finalReply) {
    return {
      kind: 'graph',
      agent_type: agentType,
      status: 'failed',
      payload: null,
      produced_user_reply: false,
      exit_info: {
        code: 'graph_error',
        message: error,
        details: { agent_type: agentType },
      },
      final_state: finalState,
    };
  }

  if (finalReply) {
    return {
      kind: 'graph',
      agent_type: agentType,
      status: 'completed',
      payload: finalReply,
      produced_user_reply: true,
      exit_info: {
        code: 'final_reply',
        message: null,
        details: { agent_type: agentType },
      },
      final_state: finalState,
    };
  }

  return {
    kind: 'graph',
    agent_type: agentType,
    status: 'completed',
    payload: null,
    produced_user_reply: false,
    exit_info: {
      code: 'graph_finished_without_reply',
      message: null,
      details: { agent_type: agentType },
    },
    final_state: finalState,
  };
}

const AGENT_GRAPH_CONFIG: Record<string, { execution_mode: string | null }> = {
  director_agent: { execution_mode: null },
  explore_agent: { execution_mode: 'DIRECT' },
  review_agent: { execution_mode: 'DIRECT' },
  plan_agent: { execution_mode: 'PLAN' },
};

function buildDefaultTools(agentType: string, userMessage: string): ToolCall[] {
  if (agentType === 'explore_agent' || agentType === 'review_agent') {
    return [
      { tool: 'thinking', args: { description: userMessage } },
      { tool: 'chat', args: { description: userMessage } },
    ];
  }
  return [];
}

const AgentStateChannels = {
  messages: { value: (a: unknown[], b: unknown[]) => a.concat(b), default: () => [] },
  current_user_message_text: { value: (_a: unknown, b: unknown) => b, default: () => '' },
  current_user_message_parts: { value: (_a: unknown, b: unknown) => b, default: () => [] },
  workspace_id: { value: (_a: unknown, b: unknown) => b, default: () => '' },
  plan: { value: (_a: unknown, b: unknown) => b, default: () => [] },
  current_step: { value: (_a: unknown, b: unknown) => b, default: () => 0 },
  results: { value: (a: unknown[], b: unknown[]) => a.concat(b), default: () => [] },
  plan_failed: { value: (_a: unknown, b: unknown) => b, default: () => false },
  explore_result: { value: (_a: unknown, b: unknown) => b, default: () => null },
  tool_history: { value: (a: unknown[], b: unknown[]) => a.concat(b), default: () => [] },
  replan_count: { value: (_a: unknown, b: unknown) => b, default: () => 0 },
  agent_type: { value: (_a: unknown, b: unknown) => b, default: () => '' },
  is_root_graph: { value: (_a: unknown, b: unknown) => b, default: () => false },
  parent_chain_messages: { value: (_a: unknown, b: unknown) => b, default: () => [] },
  current_conversation_messages: { value: (_a: unknown, b: unknown) => b, default: () => [] },
  execution_mode: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  mode_reason: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  suggested_tools: { value: (_a: unknown, b: unknown) => b, default: () => [] },
  suggested_subagent: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  in_plan_mode: { value: (_a: unknown, b: unknown) => b, default: () => false },
  active_subagent: { value: (_a: unknown, b: unknown) => b, default: () => false },
  pending_tools: { value: (_a: unknown, b: unknown) => b, default: () => [] },
  has_tool_use: { value: (_a: unknown, b: unknown) => b, default: () => false },
  final_reply: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  plan_file: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  plan_content: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  forced_execution_mode: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  last_tool_result: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  last_tool_name: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  last_tool_success: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  last_tool_error: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  iteration_count: { value: (_a: unknown, b: unknown) => b, default: () => 0 },
  max_iterations: { value: (_a: unknown, b: unknown) => b, default: () => 32 },
  todos: { value: (_a: unknown, b: unknown) => b, default: () => [] },
  current_todo_index: { value: (_a: unknown, b: unknown) => b, default: () => 0 },
  current_todo_goal: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  current_todo_done_when: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  current_todo_iteration_count: { value: (_a: unknown, b: unknown) => b, default: () => 0 },
  todo_max_iterations: { value: (_a: unknown, b: unknown) => b, default: () => 32 },
  todo_status: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  next_action: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  invalid_tool_retry_count: { value: (_a: unknown, b: unknown) => b, default: () => 0 },
  intent_analysis: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
};

function createChildAgentGraph(
  agentType: string,
  messageContext?: MessageContext,
) {
  const graph = new StateGraph({
    channels: AgentStateChannels,
  } as any);

  async function executeChildNode(state: AgentState): Promise<Partial<AgentState>> {
    const pendingTools = state.pending_tools || [];
    if (!pendingTools || pendingTools.length === 0) {
      return {
        final_reply: state.final_reply,
        has_tool_use: false,
        pending_tools: [],
      };
    }

    const toolEntry = pendingTools[0];
    const toolName = toolEntry.tool;
    const toolArgs = toolEntry.args || {};

    const toolResult = await runToolExecution({
      toolName,
      toolArgs,
      workspaceId: state.workspace_id,
      previousCalls: state.tool_history || [],
      taskDescription: (toolArgs.description as string) || '',
      previousResults: (state.tool_history || [])
        .filter((item: ToolCall) => item.result !== undefined)
        .map((item: ToolCall) => String(item.result || '')),
      agentType,
      messageContext: messageContext as unknown as Record<string, unknown>,
    });

    const resultStr = toolResult.result !== null && toolResult.result !== undefined
      ? String(toolResult.result)
      : '';

    const newHistory: ToolCall[] = [
      ...(state.tool_history || []),
      { tool: toolName, args: toolArgs, result: toolResult.result as string },
    ];

    if (toolName === 'thinking') {
      let remaining = pendingTools.slice(1);
      if (!remaining || remaining.length === 0) {
        remaining = [{ tool: 'chat', args: { description: getLastUserMessageText(state) } }];
      }
      return {
        tool_history: newHistory,
        pending_tools: remaining,
        has_tool_use: remaining.length > 0,
      };
    }

    if (toolName === 'chat') {
      return {
        tool_history: newHistory,
        pending_tools: [],
        has_tool_use: false,
        final_reply: resultStr,
      };
    }

    const remaining = pendingTools.slice(1);
    return {
      tool_history: newHistory,
      pending_tools: remaining,
      has_tool_use: remaining.length > 0,
      final_reply: resultStr || state.final_reply,
    };
  }

  function routeChild(state: AgentState): 'execute' | typeof END {
    if (state.final_reply) return END;
    if (state.pending_tools && state.pending_tools.length > 0) return 'execute';
    return END;
  }

  graph.addNode('execute', executeChildNode as any);
  (graph as any).setConditionalEntryPoint(routeChild as any, {
    execute: 'execute',
    [END]: END,
  });
  (graph as any).addConditionalEdges('execute', routeChild as any, {
    execute: 'execute',
    [END]: END,
  });

  return graph.compile();
}

function buildInitialChildState(
  userMessage: string,
  workspaceId: string,
  agentType: string,
  parentChainMessages?: Array<Record<string, unknown>>,
  currentConversationMessages?: Array<Record<string, unknown>>,
): AgentState {
  return {
    messages: [{ role: 'user', content: userMessage }],
    current_user_message_text: userMessage,
    current_user_message_parts: [],
    workspace_id: workspaceId,
    plan: [],
    current_step: 0,
    results: [],
    plan_failed: false,
    tool_history: [],
    replan_count: 0,
    agent_type: agentType,
    is_root_graph: false,
    parent_chain_messages: parentChainMessages || [],
    current_conversation_messages: currentConversationMessages || [],
    execution_mode: 'DIRECT',
    pending_tools: buildDefaultTools(agentType, userMessage),
    has_tool_use: true,
    final_reply: '',
    iteration_count: 0,
    max_iterations: 32,
    todos: [],
    current_todo_index: 0,
    todo_max_iterations: 32,
    invalid_tool_retry_count: 0,
  };
}

function createAgentGraph(
  agentType: string,
  messageContext?: MessageContext,
) {
  if (agentType === 'explore_agent' || agentType === 'review_agent') {
    return createChildAgentGraph(agentType, messageContext);
  }

  return createOrchestratorGraphV3(messageContext);
}

export async function runAgentGraph(
  agentType: string,
  userMessage: string,
  workspaceId: string,
  messageContext?: MessageContext,
  parentChainMessages?: Array<Record<string, unknown>>,
  currentConversationMessages?: Array<Record<string, unknown>>,
  forcedExecutionMode?: 'DIRECT' | 'PLAN',
  persistState: boolean = false,
): Promise<AgentOutcome> {
  logger.info({
    event: 'agent_graph.started',
    agent_type: agentType,
    workspace_id: workspaceId,
    persist_state: persistState,
  });

  try {
    const config = AGENT_GRAPH_CONFIG[agentType] || AGENT_GRAPH_CONFIG['director_agent'];

    let savedState: AgentState | null = null;
    if (persistState) {
      savedState = persistence.load(workspaceId) as AgentState | null;
    }

    let initialState: AgentState;

    if (savedState) {
      initialState = {
        ...savedState,
        messages: [...(savedState.messages || []), { role: 'user', content: userMessage }],
        current_user_message_text: userMessage,
      };
    } else {
      initialState = buildInitialChildState(
        userMessage,
        workspaceId,
        agentType,
        parentChainMessages,
        currentConversationMessages,
      );
    }

    initialState.agent_type = agentType;

    if (config.execution_mode) {
      initialState.execution_mode = config.execution_mode as 'DIRECT' | 'PLAN';
      initialState.has_tool_use = Boolean(initialState.pending_tools?.length);
      if (!initialState.pending_tools || initialState.pending_tools.length === 0) {
        initialState.pending_tools = buildDefaultTools(agentType, getLastUserMessageText(initialState));
        initialState.has_tool_use = Boolean(initialState.pending_tools?.length);
      }
    }

    if (forcedExecutionMode) {
      initialState.forced_execution_mode = forcedExecutionMode;
    }

    const graph = createAgentGraph(agentType, messageContext);
    const finalState = await graph.invoke(initialState as Record<string, unknown>) as AgentState;

    if (persistState) {
      persistence.save(workspaceId, finalState as unknown as Record<string, unknown>);
    }

    const outcome = buildAgentOutcome(agentType, finalState);

    logger.info({
      event: 'agent_graph.completed',
      agent_type: agentType,
      status: outcome.status,
      produced_user_reply: outcome.produced_user_reply,
    });

    return outcome;
  } catch (err) {
    logger.error({
      event: 'agent_graph.failed',
      agent_type: agentType,
      error: String(err),
    });

    return {
      kind: 'graph',
      agent_type: agentType,
      status: 'failed',
      payload: null,
      produced_user_reply: false,
      exit_info: {
        code: 'graph_error',
        message: String(err),
        details: { agent_type: agentType },
      },
      final_state: {} as AgentState,
    };
  }
}
