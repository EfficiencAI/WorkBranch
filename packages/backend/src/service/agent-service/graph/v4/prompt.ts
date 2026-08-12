import type { ToolRecord } from '../../state/agent-state';
import { generateToolPrompt } from '../subgraphs/tool-registry';
import { buildContextPrompt } from '../../prompts/graph-prompts';

const V4_SYSTEM_PROMPT = `你是一个任务执行代理（leader）。你的职责是根据 <current_task>、<context>、<tool_records> 等信息决定下一步动作，并严格按输出协议输出。

## 输出协议（必须遵守）
每一轮只能输出以下三种 JSON 之一，不得输出任何标签、解释或额外文本：
1. 调用工具（支持 1..N 个并行调用）：
   {"type":"tool_calls","content":{"reason":"这批调用的目的","calls":[
     {"call_seq":1,"tool_name":"工具名","tool_args":{"参数":"值"},"task_description":"原因"},
     {"call_seq":2,"tool_name":"工具名","tool_args":{}}
   ]}}
2. 向用户输出最终总结：
   {"type":"text","content":"最终总结文本"}
3. 无文本的完成：
   {"type":"done","content":null}

## 规则
1. call_seq 在批内唯一（1..N），tool_name 必须来自工具协议，tool_args 严格使用协议参数名。
2. 一次输出一批互不依赖的工具调用并行执行；有依赖关系的调用必须在后续轮次中发起。
3. 只有确实完成全部工作且能输出最终总结时，才允许 type=text；text 之后即结束。
4. 无法继续时必须用 type=text 说明阻塞原因与已确认结果，不得输出空 done。
5. 不要输出标签，<system> 等仅用于区分输入内容。

{tool_prompt}`;

const CURRENT_TASK_DEFAULT =
  '请严格按输出协议输出：type 属于 {tool_calls, text, done}；' +
  'tool_calls 的 content 必须是 {reason, calls[]}，calls 数组 1..N，call_seq 唯一；' +
  'tool_name 必须来自协议内的工具名，tool_args 使用协议内参数名；' +
  'text 的 content 为最终总结文本；done 的 content 为 null 或字符串。';

export function buildV4SystemPrompt(toolSchemaPrompt: string): string {
  return V4_SYSTEM_PROMPT.replace('{tool_prompt}', toolSchemaPrompt);
}

export function buildCurrentTask(
  actingFailures?: ToolRecord[] | null,
): string {
  const failures = (actingFailures || []).filter((f) => f && f.status === 'failed');
  if (failures.length > 0) {
    const names = failures
      .slice(0, 8)
      .map((f) => `${f.call_seq}:${f.tool_name}`)
      .join(', ');
    return (
      `本轮有 ${failures.length} 个工具调用失败（见 <tool_records> 中 status=failed 记录），` +
      `涉及 ${names}。请总结失败原因与已成功结果，并决定下一步：` +
      `补调用 / 换工具 / 输出 text 结束。`
    );
  }
  return CURRENT_TASK_DEFAULT;
}

const SUBAGENT_TOOLS = new Set(['call_explore_agent', 'call_review_agent']);

function clip(value: unknown, limit: number = 3000): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, 1500)}\n[中间省略 ${text.length - limit} 字符]\n${text.slice(-1500)}`;
}

export function formatToolRecords(toolRecords: ToolRecord[], maxRounds: number = 10): string {
  if (!toolRecords || toolRecords.length === 0) {
    return '（暂无工具执行记录）';
  }

  const byRound = new Map<number, ToolRecord[]>();
  for (const record of toolRecords) {
    if (!record || record.call_seq === undefined) continue;
    const round = record.round ?? 0;
    if (!byRound.has(round)) byRound.set(round, []);
    byRound.get(round)!.push(record);
  }

  if (byRound.size === 0) return '（暂无结构化工具执行记录）';

  const rounds = Array.from(byRound.keys())
    .sort((a, b) => a - b)
    .slice(-maxRounds);
  const lines: string[] = [];
  for (const round of rounds) {
    const items = (byRound.get(round) || []).sort((a, b) => (a.call_seq ?? 0) - (b.call_seq ?? 0));
    const reason = items.find((item) => item.reason)?.reason || '';
    const header = reason ? `round=${round} reason="${clip(reason, 200)}"` : `round=${round}`;
    lines.push(header);
    for (const item of items) {
      const status = item.status || 'success';
      let body = `  call_seq=${item.call_seq} ${item.tool_name} status=${status}`;
      if (status === 'failed') {
        body += ` error=${clip(item.error || '', 500)}`;
      } else {
        const result = item.result === null || item.result === undefined ? '' : String(item.result);
        const bodyResult = item.tool_name && SUBAGENT_TOOLS.has(item.tool_name)
          ? clip(result, 3000)
          : result;
        body += ` result=${bodyResult}`;
      }
      if (item.duration_ms !== undefined) {
        body += ` duration_ms=${item.duration_ms}`;
      }
      lines.push(body);
    }
  }
  return lines.join('\n');
}

export function formatTodoBlock(todos: unknown[], currentTodoIndex: number): string {
  if (!todos || todos.length === 0) return '';
  const lines = ['当前 TODO 列表：'];
  todos.forEach((todo, index) => {
    const description =
      typeof todo === 'string'
        ? todo
        : String((todo as Record<string, unknown>).description || todo);
    const marker = index === currentTodoIndex ? ' <= 当前执行项' : '';
    lines.push(`- [${index}] ${description}${marker}`);
  });
  lines.push(`doingIdx=${currentTodoIndex}`);
  return lines.join('\n');
}

export async function buildTaggedPrompt(options: {
  agentType: string;
  userMessage: string;
  workspaceId: string;
  roundNo: number;
  maxIterations: number;
  toolRecords: ToolRecord[];
  todos: unknown[];
  currentTodoIndex: number;
  planContent?: string;
  parentChainMessages: Array<Record<string, unknown>>;
  currentConversationMessages: Array<Record<string, unknown>>;
  parseError?: string | null;
  closurFeedback?: string | null;
  actingFailures?: ToolRecord[] | null;
  messageContext?: Record<string, unknown>;
  systemPromptOverride?: string;
}): Promise<{ systemPrompt: string; userMessage: string }> {
  const toolSchema = generateToolPrompt(options.agentType);
  let systemPrompt = buildV4SystemPrompt(toolSchema);
  if (options.systemPromptOverride) {
    systemPrompt = `${systemPrompt}\n\n${options.systemPromptOverride}`;
  }

  const currentTask = buildCurrentTask(options.actingFailures);
  const context = await buildContextPrompt(
    options.parentChainMessages,
    options.currentConversationMessages,
    currentTask,
    options.messageContext,
  );
  const todoBlock = formatTodoBlock(options.todos, options.currentTodoIndex);
  const planBlock = options.planContent
    ? `当前工作区存在计划文件 plan.md：${clip(options.planContent, 2000)}`
    : '';
  const records = formatToolRecords(options.toolRecords);

  const sections = [`<system>\n${systemPrompt}\n</system>`];
  sections.push(`<current_task>\n${currentTask}\n</current_task>`);
  if (context) sections.push(`<context>\n${context}\n</context>`);
  if (todoBlock) sections.push(`<todos>\n${todoBlock}\n</todos>`);
  if (planBlock) sections.push(`<plan>\n${planBlock}\n</plan>`);
  sections.push(`<tool_records>\n${records}\n</tool_records>`);
  if (options.parseError) sections.push(`<parse_error>\n${options.parseError}\n</parse_error>`);
  if (options.closurFeedback) {
    sections.push(`<closur-feedback>\n${options.closurFeedback}\n</closur-feedback>`);
  }
  sections.push(`<user_question>\n${options.userMessage}\n</user_question>`);

  const meta =
    `当前工作区ID: ${options.workspaceId} | 轮次: ${options.roundNo}/${options.maxIterations} ` +
    `| agent_type: ${options.agentType}`;
  return { systemPrompt, userMessage: `${sections.join('\n\n')}\n\n${meta}` };
}

export function fixedParseFailureText(detail: string, rawText: string): string {
  const rawClip = clip(rawText, 2000);
  return `解析连续失败，已终止。\n错误信息: ${detail}\n原始输出（调试用）: ${rawClip}`;
}

export function fixedIterationLimitText(maxIterations: number, recentResults: string[]): string {
  const summary = recentResults.slice(-3).filter(Boolean).map((r) => clip(r, 300)).join('；') || '无';
  return `已达最大轮次 ${maxIterations}，任务未完成。当前已确认进展: ${summary}`;
}

export function fixedToolLoopText(
  toolName: string,
  repeat: number,
  recentResults: string[],
): string {
  const summary = recentResults.slice(-3).filter(Boolean).map((r) => clip(r, 300)).join('；') || '无';
  return `检测到工具连续失败循环（${toolName} 连续失败 ${repeat} 次），已终止。当前已确认进展: ${summary}`;
}
