import type { AgentState } from '../../state/agent-state';
import { logger } from '../../../../core/logging';
import { llmService as defaultLlmService } from '../../service/llm-service';

const CLOSURING_PROMPT = `你是一个收尾校验助手。判断 leader 是否已经完成用户任务，并在工作最后输出了 text 总结。

判定标准（必须同时满足）：
1. leader 已经通过工具获取了完成任务所需的材料，或任务确实无法继续并已说明原因；
2. leader 已经输出 type=text 的最终总结文本，内容对用户问题给出了结论；
3. 如果任务没有完成，或缺少 text 总结，都必须判定为未通过。

输出（严格 JSON）：
{"passed": true/false, "reason": "一句话理由", "feedback": "未通过时给 leader 的改进提示（不超过 120 字）"}`;

export interface ClosuringNodeOptions {
  llmService?: unknown;
  settingsService?: unknown;
  messageContext?: Record<string, unknown>;
  enabled?: boolean;
  maxRounds?: number;
}

function isEnabled(options: ClosuringNodeOptions): boolean {
  if (options.enabled !== undefined) return options.enabled;
  const settings = options.settingsService as { get?: (key: string) => unknown } | undefined;
  try {
    return Boolean(settings?.get?.('agent:closuring_enabled'));
  } catch {
    return false;
  }
}

function maxRounds(options: ClosuringNodeOptions): number {
  const configured =
    (options.settingsService as { get?: (key: string) => unknown } | undefined)?.get?.(
      'agent:closure_max_rounds',
    );
  const value = Number(configured);
  return Number.isFinite(value) && value > 0 ? value : options.maxRounds ?? 8;
}

function extractJson(text: string): Record<string, unknown> | null {
  let candidate = text.trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) candidate = fenced[1].trim();
  try {
    const data = JSON.parse(candidate);
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        const data = JSON.parse(candidate.slice(start, end + 1));
        return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildFeedbackCheckPrompt(state: AgentState): string {
  const finalText = state.pending_final_text || state.final_reply || '';
  const records = (state.tool_records || [])
    .filter((r) => r && r.call_seq !== undefined)
    .slice(-20)
    .map(
      (r) =>
        `call_seq=${r.call_seq} ${r.tool_name} status=${r.status || 'success'} result=${String(r.result || '').slice(0, 300)}`,
    )
    .join('\n');
  const userQuestion = state.current_user_message_text || '';
  return (
    `用户问题：${userQuestion}\n\n` +
    `leader 的 text 总结：\n${finalText.slice(0, 2000)}\n\n` +
    `工具执行记录：\n${records || '（无）'}\n\n` +
    '请按判定标准输出 JSON。'
  );
}

export function createClosuringNode(options: ClosuringNodeOptions = {}) {
  const llm = (options.llmService ?? defaultLlmService) as {
    chat?: (messages: Array<{ role: string; content: string }>, systemPrompt?: string) => Promise<string>;
  };

  return async (state: AgentState): Promise<Partial<AgentState>> => {
    if (!isEnabled(options)) {
      return { _route_target: 'finalize' };
    }

    const closureRounds = (state.closure_rounds || 0) + 1;
    const budget = maxRounds(options);
    if (closureRounds > budget) {
      logger.warn({ event: 'v4.closuring.budget_exhausted', closureRounds, budget });
      return { closure_rounds: closureRounds, _route_target: 'finalize' };
    }

    let passed = false;
    let feedback = '';
    let reason = '';
    try {
      const response = await llm.chat!(
        [{ role: 'user', content: buildFeedbackCheckPrompt(state) }],
        CLOSURING_PROMPT,
      );
      const data = extractJson(String(response || '')) || {};
      passed = Boolean(data.passed);
      feedback = String(data.feedback || '');
      reason = String(data.reason || '');
    } catch (err) {
      logger.warn({ event: 'v4.closuring.judge_failed', error: String(err) });
      return { closure_rounds: closureRounds, _route_target: 'finalize' };
    }

    logger.info({ event: 'v4.closuring.judged', closureRounds, passed, reason });

    if (passed) {
      return { closure_rounds: closureRounds, _route_target: 'finalize' };
    }

    return {
      closure_rounds: closureRounds,
      closur_feedback:
        feedback ||
        '你还没有在工作最后使用 text 进行总结反馈，需要先完成总结再 done。',
      pending_final_text: null,
      final_reply: undefined,
      _route_target: 'reasoning',
    };
  };
}

export function routeAfterClosuring(state: AgentState): string {
  return state._route_target || 'finalize';
}
