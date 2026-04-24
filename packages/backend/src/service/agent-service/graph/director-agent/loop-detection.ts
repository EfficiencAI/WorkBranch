import type { ToolCall, TodoItem } from '../../state/agent-state';
import { llmService } from '../../service/llm-service';
import { logger } from '../../../../core/logging';

export const CHECK_INTERVAL = 8;

export interface LoopCheckResult {
  action: 'continue' | 'stop';
  reason: string;
}

export function buildLoopCheckPrompt(
  toolHistory: ToolCall[],
  iterationCount: number,
  userMessage: string = '',
  conversationHistory: Array<{ role: string; content: string }> = [],
  todos?: TodoItem[]
): string {
  const recentHistory = toolHistory.slice(-CHECK_INTERVAL);

  const historyLines = recentHistory.map((item, idx) => {
    const toolName = item.tool || 'unknown';
    const argsStr = JSON.stringify(item.args || {}).slice(0, 100);
    const resultPreview = String(item.result || '').slice(0, 200);
    return `第${idx + 1}轮: 工具=${toolName}, 参数=${argsStr}, 结果摘要=${resultPreview}...`;
  });
  const historyBlock = historyLines.join('\n') || '(暂无工具调用历史)';

  const userMessageBlock = userMessage
    ? `\n## 用户原始请求\n${userMessage.slice(0, 500)}`
    : '';

  const conversationBlock =
    conversationHistory.length > 0
      ? `\n## 对话历史\n${conversationHistory
          .slice(-6)
          .map((msg) => `[${msg.role}]: ${msg.content.slice(0, 300)}`)
          .join('\n')}`
      : '';

  const todosBlock =
    todos && todos.length > 0
      ? `\n## 待办事项\n${todos
          .slice(0, 10)
          .map((todo, idx) => `${idx + 1}. [${todo.status}] ${todo.description.slice(0, 100)}`)
          .join('\n')}`
      : '';

  return `你是一个任务执行监控器。请分析以下信息，判断任务执行是否存在循环或卡死情况。
${userMessageBlock}${conversationBlock}${todosBlock}
## 最近${recentHistory.length}轮工具调用历史
${historyBlock}

## 当前状态
- 已执行轮次: ${iterationCount}

## 判断标准
1. **循环**: 连续多次调用相同工具，使用相同或非常相似的参数，且结果没有实质进展
2. **卡死**: 工具调用失败后反复重试，或在一个无效状态中无法跳出
3. **正常**: 工具调用有变化，或正在逐步推进任务，或者正在处理复杂任务需要更多步骤

## 重要提示
- 如果工具调用正在推进任务（例如：创建目录后创建文件，读取文件后修改内容），应判断为"正常"
- 如果用户请求是复杂任务（如创建项目、多文件修改），可能需要较多工具调用，应判断为"正常"
- 只有在明确看到重复调用相同工具且无进展时，才判断为"循环"

## 输出要求
请以JSON格式返回判断结果：
- 如果判断为循环或卡死，返回: {"action": "stop", "reason": "具体原因"}
- 如果判断为正常，返回: {"action": "continue", "reason": "简要说明"}

只返回JSON，不要其他内容。`;
}

export function detectLoopPattern(toolHistory: ToolCall[]): { detected: boolean; pattern?: string } {
  if (toolHistory.length < 3) {
    return { detected: false };
  }

  const recentCalls = toolHistory.slice(-6);
  const toolNames = recentCalls.map((call) => call.tool);
  const argsStrings = recentCalls.map((call) => JSON.stringify(call.args));
  const uniqueTools = new Set(toolNames);
  const uniqueArgs = new Set(argsStrings);

  if (uniqueArgs.size === 1 && argsStrings.length >= 3) {
    return { detected: true, pattern: 'same_args_repeated' };
  }

  if (uniqueTools.size === 1 && toolNames.length >= 3) {
    return { detected: true, pattern: 'same_tool_repeated' };
  }

  if (uniqueTools.size === 2 && toolNames.length >= 4) {
    let isAlternating = true;
    for (let i = 0; i < toolNames.length - 1; i++) {
      if (toolNames[i] === toolNames[i + 1]) {
        isAlternating = false;
        break;
      }
    }

    if (isAlternating) {
      const toolCounts: Record<string, number> = {};
      for (const tool of toolNames) {
        toolCounts[tool] = (toolCounts[tool] || 0) + 1;
      }
      const counts = Object.values(toolCounts);
      if (counts.every((c) => c >= 2)) {
        return { detected: true, pattern: 'alternating_loop' };
      }
    }
  }

  return { detected: false };
}

export function shouldCheckLoop(iterationCount: number, checkInterval: number = CHECK_INTERVAL): boolean {
  return iterationCount > 0 && iterationCount % checkInterval === 0;
}

export async function checkLoopOrStuck(
  toolHistory: ToolCall[],
  iterationCount: number,
  userMessage: string = '',
  conversationHistory: Array<{ role: string; content: string }> = [],
  todos?: TodoItem[]
): Promise<LoopCheckResult> {
  const patternResult = detectLoopPattern(toolHistory);
  if (patternResult.detected) {
    logger.warn({
      event: 'loop_detection.pattern_detected',
      pattern: patternResult.pattern,
      iteration_count: iterationCount,
    });
    return {
      action: 'stop',
      reason: `检测到循环模式: ${patternResult.pattern}`,
    };
  }

  if (!shouldCheckLoop(iterationCount)) {
    return { action: 'continue', reason: '未到检查间隔' };
  }

  try {
    const prompt = buildLoopCheckPrompt(toolHistory, iterationCount, userMessage, conversationHistory, todos);
    const response = await llmService.chat([{ role: 'user', content: prompt }]);

    let responseText = response.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.slice(7);
    }
    if (responseText.startsWith('```')) {
      responseText = responseText.slice(3);
    }
    if (responseText.endsWith('```')) {
      responseText = responseText.slice(0, -3);
    }
    responseText = responseText.trim();

    const result = JSON.parse(responseText);

    if (result.action === 'stop') {
      logger.warn({
        event: 'loop_detection.llm_detected',
        reason: result.reason,
        iteration_count: iterationCount,
      });
      return {
        action: 'stop',
        reason: result.reason || 'LLM 判断存在循环',
      };
    }

    return {
      action: 'continue',
      reason: result.reason || 'LLM 判断正常',
    };
  } catch (err) {
    logger.warn({
      event: 'loop_detection.llm_check_failed',
      error: String(err),
    });
    return { action: 'continue', reason: 'LLM 检查失败，默认继续' };
  }
}
