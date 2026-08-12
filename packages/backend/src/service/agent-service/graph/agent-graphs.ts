import type { AgentState } from '../state/agent-state';
import type { MessageContext } from './director-agent/director-agent';
import { createOrchestratorGraphV3 } from './director-agent/director-agent';
import { llmService } from '../service/llm-service';
import { buildV4ChildLoop } from './v4';
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
    web_search_enabled: true,
    pending_tools: [],
    has_tool_use: false,
    final_reply: '',
    iteration_count: 0,
    max_iterations: 32,
    todos: [],
    current_todo_index: 0,
    todo_max_iterations: 32,
    invalid_tool_retry_count: 0,
    tool_records: [],
    pending_batch: null,
    pending_final_text: null,
    parse_error: null,
    parse_error_raw: null,
    decision_error_count: 0,
    acting_failures: null,
    closur_feedback: null,
    closure_rounds: 0,
    output_type: null,
    _route_target: null,
  };
}

function createAgentGraph(
  agentType: string,
  messageContext?: MessageContext,
) {
  if (agentType === 'director_agent') {
    return createOrchestratorGraphV3(messageContext);
  }

  return buildV4ChildLoop({
    llmService,
    messageContext: messageContext as unknown as Record<string, unknown>,
  });
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
  webSearchEnabled: boolean = true,
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
    initialState.web_search_enabled = webSearchEnabled;

    if (config.execution_mode) {
      initialState.execution_mode = config.execution_mode as 'DIRECT' | 'PLAN';
    }

    if (forcedExecutionMode) {
      initialState.forced_execution_mode = forcedExecutionMode;
    }

    const graph = createAgentGraph(agentType, messageContext);
    const finalState = await graph.invoke(
      initialState as unknown as Record<string, unknown>,
      { recursionLimit: 200 },
    ) as AgentState;

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
