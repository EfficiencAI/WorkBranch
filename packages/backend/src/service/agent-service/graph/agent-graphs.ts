import type { AgentState } from '../state/agent-state';
import type { MessageContext } from './director-agent/director-agent';
import { runDirectorGraph } from './director-agent/director-agent';
import { SegmentType } from '../../session-service/canonical';
import { llmService } from '../service/llm-service';
import { logger } from '../../../core/logging';

const SUBAGENT_TIMEOUT_MS = 45000;

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

const EXPLORE_AGENT_PROMPT = '你是一个专业的代码探索代理。你的任务是帮助用户探索和分析代码库或搜索互联网信息。\n\n请根据任务描述，给出清晰的分析结果。';

const REVIEW_AGENT_PROMPT = '你是一个专业的代码审查代理。你的任务是审查代码质量、发现潜在问题并提供改进建议。\n\n审查要点：\n1. 代码质量和可读性\n2. 潜在的 bug 和错误\n3. 性能问题\n4. 安全隐患\n5. 最佳实践建议\n\n请根据任务描述，仔细审查并给出专业的审查意见。';

async function runChildAgentLoop(
  agentType: string,
  userMessage: string,
  messageContext?: MessageContext,
): Promise<string> {
  const systemPrompt = agentType === 'explore_agent' ? EXPLORE_AGENT_PROMPT : REVIEW_AGENT_PROMPT;

  if (messageContext?.send_message) {
    await messageContext.send_message('', SegmentType.TEXT_START, {
      agent_type: agentType,
      is_start: true,
    });
  }

  let result = '';
  try {
    for await (const chunk of llmService.chatStream(
      [{ role: 'user', content: userMessage }],
      systemPrompt,
    )) {
      result += chunk;
      if (messageContext?.send_message) {
        await messageContext.send_message(chunk, SegmentType.TEXT_DELTA, {
          agent_type: agentType,
          is_delta: true,
        });
      }
    }
  } catch (err) {
    logger.error({
      event: 'child_agent.stream_failed',
      agent_type: agentType,
      error: String(err),
    });
    result = String(err);
  }

  if (messageContext?.send_message) {
    await messageContext.send_message('', SegmentType.TEXT_END, {
      agent_type: agentType,
      is_end: true,
      result,
    });
  }

  return result;
}

export async function runAgentGraph(
  agentType: string,
  userMessage: string,
  workspaceId: string,
  messageContext?: MessageContext,
  parentChainMessages?: Array<Record<string, unknown>>,
  currentConversationMessages?: Array<Record<string, unknown>>,
  forcedExecutionMode?: 'DIRECT' | 'PLAN',
): Promise<AgentOutcome> {
  logger.info({
    event: 'agent_graph.started',
    agent_type: agentType,
    workspace_id: workspaceId,
  });

  try {
    let finalState: AgentState;

    if (agentType === 'explore_agent' || agentType === 'review_agent') {
      const executeWithTimeout = async (): Promise<string> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), SUBAGENT_TIMEOUT_MS);

        try {
          const result = await runChildAgentLoop(agentType, userMessage, messageContext);
          return result;
        } finally {
          clearTimeout(timeoutId);
        }
      };

      const result = await executeWithTimeout();

      finalState = {
        messages: [{ role: 'user', content: userMessage }],
        current_user_message_text: userMessage,
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
        pending_tools: [],
        has_tool_use: false,
        final_reply: result,
        iteration_count: 0,
        max_iterations: 32,
        todos: [],
        current_todo_index: 0,
        todo_max_iterations: 32,
        invalid_tool_retry_count: 0,
      };
    } else {
      finalState = await runDirectorGraph(
        userMessage,
        workspaceId,
        messageContext,
        parentChainMessages,
        currentConversationMessages,
        agentType,
        forcedExecutionMode,
      );
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
