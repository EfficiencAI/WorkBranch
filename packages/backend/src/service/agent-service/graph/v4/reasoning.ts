import type { AgentState, ToolCallSpec, ToolRecord } from '../../state/agent-state';
import { logger } from '../../../../core/logging';
import { llmService as defaultLlmService } from '../../service/llm-service';
import { settingsService as defaultSettingsService } from '../../../settings-service';
import { getAllowedTools } from '../subgraphs/tool-registry';
import {
  buildTaggedPrompt,
  fixedIterationLimitText,
  fixedParseFailureText,
  fixedToolLoopText,
} from './prompt';
import {
  LeaderOutputParseError,
  leaderOutputJsonSchema,
  parseLeaderOutput,
  validateLeaderOutput,
} from './protocol';

export const MAX_DECISION_RETRIES = 3;
export const MAX_RECORD_LOOP = 3;

export function detectToolFailureLoop(
  toolRecords: ToolRecord[],
): { toolName: string; repeat: number } | null {
  const records = toolRecords.filter((r) => r && r.call_seq !== undefined);
  if (records.length < 4) return null;
  const tail = records.slice(-5);

  const lastName = tail[tail.length - 1]?.tool_name;
  let repeat = 0;
  for (let i = tail.length - 1; i >= 0; i -= 1) {
    const r = tail[i];
    if (r.tool_name === lastName && r.status === 'failed') repeat += 1;
    else break;
  }
  if (repeat >= MAX_RECORD_LOOP) return { toolName: lastName || '(unknown)', repeat };

  const recentFailures = tail.filter((r) => r.status === 'failed').length;
  if (recentFailures >= 4 && tail.length >= 5) {
    return { toolName: '(多个工具)', repeat: recentFailures };
  }
  return null;
}

export function recentResults(toolRecords: ToolRecord[]): string[] {
  return toolRecords
    .filter((r) => r && r.call_seq !== undefined && r.result)
    .map((r) => String(r.result));
}

export function terminalUpdate(text: string): Partial<AgentState> {
  return {
    pending_final_text: text,
    final_reply: text,
    has_tool_use: false,
    pending_tools: [],
    pending_batch: null,
    parse_error: null,
    closur_feedback: null,
    _route_target: 'finalize',
  };
}

function getLastUserMessageText(state: AgentState): string {
  const messages = state.messages || [];
  if (messages.length === 0) return '';
  const last = messages[messages.length - 1];
  if (typeof last === 'string') return last;
  if (typeof last === 'object' && last !== null) {
    const obj = last as Record<string, unknown>;
    if (typeof obj.content === 'string') return obj.content;
  }
  return '';
}

export interface ReasoningNodeOptions {
  llmService?: unknown;
  settingsService?: unknown;
  messageContext?: Record<string, unknown>;
  closuringEnabled?: boolean;
  maxDecisionRetries?: number;
}

export function createReasoningNode(options: ReasoningNodeOptions = {}) {
  const llm = (options.llmService ?? defaultLlmService) as {
    structuredOutput?: <T>(
      messages: Array<{ role: string; content: string }>,
      schema: Record<string, unknown>,
      systemPrompt?: string,
    ) => Promise<T>;
    chat?: (
      messages: Array<{ role: string; content: string }>,
      systemPrompt?: string,
    ) => Promise<string>;
  };

  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const agentType = state.agent_type || 'director_agent';
    const userMessage = state.current_user_message_text || getLastUserMessageText(state);
    const workspaceId = state.workspace_id;
    const iterationCount = state.iteration_count || 0;
    const maxIterations = state.max_iterations || 32;
    const toolRecords = state.tool_records || [];

    // ===== 入口闸门：已有最终回复（chat 兜底 / 收尾反馈后） =====
    if (state.final_reply) {
      return terminalUpdate(String(state.final_reply));
    }

    // ===== 入口闸门：工具失败循环 =====
    const loop = detectToolFailureLoop(toolRecords);
    if (loop) {
      logger.warn({ event: 'v4.reasoning.tool_loop', loop });
      return terminalUpdate(fixedToolLoopText(loop.toolName, loop.repeat, recentResults(toolRecords)));
    }

    // ===== 入口闸门：轮次上限 =====
    if (iterationCount >= maxIterations) {
      logger.warn({ event: 'v4.reasoning.iteration_limit', iterationCount, maxIterations });
      return terminalUpdate(fixedIterationLimitText(maxIterations, recentResults(toolRecords)));
    }

    // ===== 入口闸门：解析/语义重试超限 =====
    const decisionErrorCount = state.decision_error_count || 0;
    const maxDecisionRetries = options.maxDecisionRetries ?? MAX_DECISION_RETRIES;
    if (decisionErrorCount >= maxDecisionRetries) {
      const detail = state.parse_error || '多次解析失败';
      return terminalUpdate(fixedParseFailureText(detail.slice(0, 500), state.parse_error_raw || ''));
    }

    // ===== 预置批（analyze 注入的多模态 chat 等）直接执行 =====
    if (state.pending_tools && state.pending_tools.length > 0) {
      const calls: ToolCallSpec[] = state.pending_tools.map((tool, index) => {
        const args = (tool.args || {}) as Record<string, unknown>;
        return {
          call_seq: index,
          tool_name: tool.tool,
          tool_args: args,
          task_description:
            typeof args.task_description === 'string'
              ? args.task_description
              : typeof args.description === 'string'
                ? args.description
                : userMessage,
        };
      });
      return {
        pending_batch: { reason: 'pre-seeded', calls },
        _route_target: 'acting',
      };
    }

    if (!llm.chat && !llm.structuredOutput) {
      return terminalUpdate('无法自动决策下一步：LLM 服务未配置。');
    }

    // ===== 组装标签化提示词 =====
    const { systemPrompt, userMessage: userMessageText } = await buildTaggedPrompt({
      agentType,
      userMessage,
      workspaceId,
      roundNo: iterationCount + 1,
      maxIterations,
      toolRecords,
      todos: state.todos || [],
      currentTodoIndex: state.current_todo_index || 0,
      planContent: state.plan_content,
      parentChainMessages: state.parent_chain_messages || [],
      currentConversationMessages: state.current_conversation_messages || [],
      parseError: state.parse_error,
      closurFeedback: state.closur_feedback,
      actingFailures: state.acting_failures,
      messageContext: options.messageContext,
    });

    // ===== LLM 调用（结构化输出可配置，默认普通 chat + JSON 解析） =====
    let useStructured = false;
    try {
      useStructured =
        ((options.settingsService ?? defaultSettingsService) as { get?: (key: string) => unknown })
          ?.get?.('agent:structured_output') === true;
    } catch {
      useStructured = false;
    }
    let rawResponse = '';
    try {
      if (useStructured && llm.structuredOutput) {
        try {
          const parsedObj = await llm.structuredOutput(
            [{ role: 'user', content: userMessageText }],
            leaderOutputJsonSchema(),
            systemPrompt,
          );
          rawResponse = typeof parsedObj === 'string' ? parsedObj : JSON.stringify(parsedObj);
        } catch (structuredErr) {
          // 结构化输出不受供应商支持（如 thinking 模式的 tool_choice 限制），降级普通 chat + JSON 解析
          if (!llm.chat) throw structuredErr;
          logger.warn({
            event: 'v4.reasoning.structured_output_fallback',
            error: String(structuredErr).slice(0, 300),
          });
          rawResponse = await llm.chat!([{ role: 'user', content: userMessageText }], systemPrompt);
        }
      } else {
        rawResponse = await llm.chat!([{ role: 'user', content: userMessageText }], systemPrompt);
      }
      rawResponse = String(rawResponse ?? '').trim();
      if (!rawResponse) throw new Error('LLM 返回了空响应');
    } catch (err) {
      const nextErrorCount = decisionErrorCount + 1;
      const rawFallback =
        typeof (err as { response_text?: unknown }).response_text === 'string'
          ? String((err as { response_text: unknown }).response_text)
          : rawResponse;
      if (nextErrorCount >= maxDecisionRetries) {
        return terminalUpdate(fixedParseFailureText(`LLM 调用失败: ${String(err)}`, rawFallback));
      }
      return {
        decision_error_count: nextErrorCount,
        parse_error: `类别: llm_call\n说明: ${String(err)}\n原文: ${rawFallback}`,
        parse_error_raw: rawFallback,
        _route_target: 'reasoning',
      };
    }

    logger.info({
      event: 'v4.reasoning.raw_response',
      agent_type: agentType,
      full_length: rawResponse.length,
    });

    // ===== 解析（容错链） =====
    let parsed;
    try {
      parsed = parseLeaderOutput(rawResponse);
    } catch (err) {
      const nextErrorCount = decisionErrorCount + 1;
      if (nextErrorCount >= maxDecisionRetries) {
        const detail = err instanceof LeaderOutputParseError ? `[${err.category}] ${err.message}` : String(err);
        return terminalUpdate(fixedParseFailureText(detail, rawResponse));
      }
      const detail = err instanceof LeaderOutputParseError ? `[${err.category}] ${err.message}` : String(err);
      return {
        decision_error_count: nextErrorCount,
        parse_error: `类别: ${err instanceof LeaderOutputParseError ? err.category : 'parse'}\n说明: ${detail}\n原文: ${rawResponse}`,
        parse_error_raw: rawResponse,
        _route_target: 'reasoning',
      };
    }

    // ===== 语义校验（hard 层） =====
    const allowedTools = getAllowedTools(agentType, state.web_search_enabled !== false);
    const issues = validateLeaderOutput(parsed, allowedTools);
    if (issues.length > 0) {
      const nextErrorCount = decisionErrorCount + 1;
      const issueText = issues.join('；');
      if (nextErrorCount >= maxDecisionRetries) {
        return terminalUpdate(fixedParseFailureText(`语义校验失败: ${issueText}`, rawResponse));
      }
      return {
        decision_error_count: nextErrorCount,
        parse_error: `类别: semantic\n说明: ${issueText}\n原文: ${rawResponse}`,
        parse_error_raw: rawResponse,
        _route_target: 'reasoning',
      };
    }

    // ===== 成功：路由 =====
    if (parsed.type === 'tool_calls') {
      return {
        pending_batch: parsed.content,
        parse_error: null,
        parse_error_raw: null,
        closur_feedback: null,
        decision_error_count: 0,
        acting_failures: null,
        _route_target: 'acting',
      };
    }

    const finalText = String(parsed.content || '');
    const useClosuring = options.closuringEnabled === true;
    return {
      pending_final_text: finalText,
      final_reply: finalText,
      output_type: parsed.type,
      has_tool_use: false,
      pending_tools: [],
      pending_batch: null,
        parse_error: null,
      parse_error_raw: null,
      closur_feedback: null,
      decision_error_count: 0,
      _route_target: useClosuring ? 'closuring' : 'finalize',
    };
  };
}

export function routeAfterReasoning(state: AgentState): string {
  return state._route_target || 'reasoning';
}
