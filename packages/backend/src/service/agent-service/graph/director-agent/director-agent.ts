import { StateGraph, END, START } from '@langchain/langgraph';
import type { AgentState, NextAction, ToolCall, TodoItem, IntentAnalysis } from '../../state/agent-state';
import { ExecutionMode } from '../decision/complexity-analyzer';
import { checkLoopOrStuck, shouldCheckLoop } from './loop-detection';
import { runToolExecution } from '../subgraphs/tool-execution-graph';
import { llmService } from '../../service/llm-service';
import { planFileService } from '../../service/plan-file-service';
import { runAgentGraph } from '../agent-graphs';
import { SegmentType } from '../../../session-service/canonical';
import { logger } from '../../../../core/logging';
import { toolRegistry } from '../../tools/registry';

export interface MessageContext {
  send_message?: (content: string, type: SegmentType, metadata?: Record<string, unknown>) => Promise<void>;
  session_id?: string;
  conversation_id?: string;
  workspace_id?: string;
  message_id?: string;
  cancel_check?: () => void;
  settings_service?: Record<string, unknown>;
}

const DEFAULT_ALLOWED_TOOLS: Record<string, string[]> = {
  director_agent: [
    'read_file', 'write_file', 'delete_file', 'list_dir', 'create_dir',
    'explore_code', 'explore_internet', 'thinking', 'chat',
    'call_explore_agent', 'call_review_agent',
    'list_workspace_files', 'get_workspace_info', 'search_files',
    'update_todo', 'switch_execution_mode',
  ],
  plan_agent: [
    'read_file', 'write_file', 'list_dir', 'explore_code', 'thinking', 'chat',
    'call_explore_agent', 'call_review_agent', 'switch_execution_mode',
  ],
  review_agent: ['read_file', 'list_dir', 'explore_code', 'thinking', 'chat'],
  explore_agent: [
    'read_file', 'list_dir', 'thinking', 'chat', 'explore_internet',
    'list_workspace_files', 'get_workspace_info', 'search_files',
  ],
};

function modeName(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.toUpperCase();
  if (value === ExecutionMode.DIRECT) return 'DIRECT';
  if (value === ExecutionMode.PLAN) return 'PLAN';
  return String(value).split('.').pop()?.toUpperCase() ?? null;
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

function getAllowedTools(agentType: string): string[] {
  return DEFAULT_ALLOWED_TOOLS[agentType] || DEFAULT_ALLOWED_TOOLS['director_agent'];
}

function isToolAllowed(toolName: string, agentType: string): boolean {
  return getAllowedTools(agentType).includes(toolName);
}

function buildContextPrompt(
  parentChainMessages: Array<Record<string, unknown>>,
  currentConversationMessages: Array<Record<string, unknown>>,
  currentTask: string,
): string {
  const parts: string[] = [];

  if (parentChainMessages.length > 0) {
    parts.push('[历史对话]');
    for (const msg of parentChainMessages) {
      const role = (msg.role as string) || 'user';
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      parts.push(`${role}: ${content}`);
    }
    parts.push('');
  }

  if (currentConversationMessages.length > 0) {
    parts.push('[当前对话内历史]');
    for (const msg of currentConversationMessages) {
      const role = (msg.role as string) || 'user';
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      parts.push(`${role}: ${content}`);
    }
    parts.push('');
  }

  parts.push('[当前任务]');
  parts.push(currentTask);

  return parts.join('\n');
}

function formatTodoPromptBlock(todos: TodoItem[], currentTodoIndex: number): string {
  if (!todos || todos.length === 0) return '';

  const lines = ['当前 TODO 列表（完整状态）:'];
  for (let idx = 0; idx < todos.length; idx++) {
    const todo = todos[idx];
    const marker = idx === currentTodoIndex ? ' <= 当前执行项' : '';
    lines.push(`- [${idx}] [${todo.status}] ${todo.description}${marker}`);
  }
  lines.push(`doingIdx=${currentTodoIndex}`);
  lines.push('如果任务明显是多步骤、阶段化，或执行中发现当前任务过大/过难，应使用 update_todo 一次性写入或重写完整 todo 列表；如果任务本身是单步骤且简单，则不要使用 todo 工具。');
  return lines.join('\n');
}

function emitFinalReply(reply: string, messageContext?: MessageContext): void {
  if (!messageContext?.send_message) return;
  const send = messageContext.send_message;
  send('', SegmentType.CHAT_START, { task_description: '输出最终回复', is_start: true });
  if (reply) {
    send(reply, SegmentType.CHAT_DELTA, { task_description: '输出最终回复', is_delta: true });
  }
  send('', SegmentType.CHAT_END, { task_description: '输出最终回复', is_end: true, result: reply });
}

async function _executeChatToolDirect(
  taskDescription: string,
  messageContext: MessageContext | undefined,
  parentChainMessages: Array<Record<string, unknown>>,
  currentConversationMessages: Array<Record<string, unknown>>,
): Promise<string> {
  const CHAT_SYSTEM_PROMPT = '你是一个专业的软件工程师助手。当前需要向用户输出回复。\n\n你会收到：\n1. 当前任务描述\n2. 之前任务的执行结果（如果有）\n\n请直接向用户输出回复内容：\n- 语言简洁清晰\n- 直接回答用户问题\n- 不要输出思考过程，只输出最终回复\n- 使用友好、专业的语气';

  const fullPrompt = buildContextPrompt(
    parentChainMessages,
    currentConversationMessages,
    taskDescription,
  );

  if (messageContext?.send_message) {
    await messageContext.send_message('', SegmentType.CHAT_START, {
      task_description: taskDescription,
      is_start: true,
    });
  }

  let result = '';
  try {
    for await (const chunk of llmService.chatStream([{ role: 'user', content: fullPrompt }], CHAT_SYSTEM_PROMPT)) {
      result += chunk;
      if (messageContext?.send_message) {
        await messageContext.send_message(chunk, SegmentType.CHAT_DELTA, {
          task_description: taskDescription,
          is_delta: true,
        });
      }
    }
  } catch (err) {
    logger.error({ event: 'chat_tool.stream_failed', error: String(err) });
    result = String(err);
  }

  if (messageContext?.send_message) {
    await messageContext.send_message('', SegmentType.CHAT_END, {
      task_description: taskDescription,
      is_end: true,
      result,
    });
  }

  return result;
}

async function _executeThinkingToolDirect(
  taskDescription: string,
  messageContext: MessageContext | undefined,
  parentChainMessages: Array<Record<string, unknown>> = [],
  currentConversationMessages: Array<Record<string, unknown>> = [],
): Promise<string> {
  const THINKING_SYSTEM_PROMPT = '你是一个专业的软件工程师助手。当前正在执行一个任务计划中的某个步骤。\n\n你会收到：\n1. 当前任务描述\n2. 之前任务的执行结果（如果有）\n\n请针对当前任务进行思考：\n1. 分析任务目标\n2. 结合之前的执行结果（如果有）\n3. 给出你的思考过程和结论\n\n请简洁清晰地回答，不要过于冗长。';

  const fullPrompt = buildContextPrompt(
    parentChainMessages,
    currentConversationMessages,
    taskDescription,
  );

  if (messageContext?.send_message) {
    await messageContext.send_message('', SegmentType.THINKING_START, {
      task_description: taskDescription,
      is_start: true,
    });
  }

  let result = '';
  try {
    for await (const chunk of llmService.chatStream(
      [{ role: 'user', content: fullPrompt }],
      THINKING_SYSTEM_PROMPT,
    )) {
      result += chunk;
      if (messageContext?.send_message) {
        await messageContext.send_message(chunk, SegmentType.THINKING_DELTA, {
          task_description: taskDescription,
          is_delta: true,
        });
      }
    }
  } catch (err) {
    logger.error({ event: 'thinking_tool.stream_failed', error: String(err) });
    result = String(err);
  }

  if (messageContext?.send_message) {
    await messageContext.send_message('', SegmentType.THINKING_END, {
      task_description: taskDescription,
      is_end: true,
      result,
    });
  }

  return result;
}

function stripCodeBlock(text: string): string {
  let result = text.trim();
  if (result.startsWith('```json')) result = result.slice(7);
  else if (result.startsWith('```')) result = result.slice(3);
  if (result.endsWith('```')) result = result.slice(0, -3);
  return result.trim();
}

export function checkState(state: AgentState): 'analyze' | 'decide' | 'execute' | 'done' {
  if (state.pending_tools && state.pending_tools.length > 0) return 'execute';
  if (state.final_reply) return 'done';
  return 'decide';
}

export function routeAfterAnalyze(state: AgentState): 'decide' | 'execute' | 'done' {
  if (state.pending_tools && state.pending_tools.length > 0) return 'execute';
  return 'decide';
}

export function routeAfterExecute(state: AgentState): 'analyze' | 'decide' | 'todo_review' | 'execute' | 'done' {
  if (state.final_reply) return 'done';

  const nextAction = state.next_action || {} as NextAction;
  if (nextAction.kind === 'enter_plan') return 'analyze';

  if (state.pending_tools && state.pending_tools.length > 0) return 'execute';

  if (modeName(state.execution_mode) === 'DIRECT' && (!state.pending_tools || state.pending_tools.length === 0)) {
    return 'todo_review';
  }

  return checkState(state);
}

export function routeAfterTodoReview(_state: AgentState): 'decide' {
  return 'decide';
}

export function createAnalyzeNode(messageContext?: MessageContext) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const userMessage = getLastUserMessageText(state);
    const currentAgentType = state.agent_type || 'director_agent';
    const forcedExecutionMode = state.forced_execution_mode;
    const existingExecutionMode = state.execution_mode;

    logger.info({ event: 'director.analyze.entry', user_message: userMessage.slice(0, 100) });

    let modeDecision: { mode: string; reason: string };

    if (existingExecutionMode !== undefined && existingExecutionMode !== null) {
      modeDecision = {
        mode: existingExecutionMode,
        reason: `保持已有执行模式: ${modeName(existingExecutionMode)}`,
      };
    } else if (forcedExecutionMode !== undefined && forcedExecutionMode !== null) {
      modeDecision = {
        mode: forcedExecutionMode,
        reason: `使用预设执行模式: ${forcedExecutionMode}`,
      };
    } else if (currentAgentType !== 'director_agent') {
      modeDecision = {
        mode: ExecutionMode.DIRECT,
        reason: `${currentAgentType} 使用专属 graph，默认走 DIRECT 执行`,
      };
    } else {
      modeDecision = {
        mode: ExecutionMode.DIRECT,
        reason: 'director_agent 默认从 DIRECT 开始，由 agent 在需要时主动切到 PLAN',
      };
    }

    const intentAnalysis: IntentAnalysis = {
      intent_type: 'other',
      summary: userMessage.slice(0, 100),
      key_points: userMessage ? [userMessage] : [],
      suggested_tools: [],
      complexity: 'medium',
      confidence: 0.7,
    };

    const result: Partial<AgentState> = {
      intent_analysis: intentAnalysis,
      execution_mode: modeDecision.mode as AgentState['execution_mode'],
      mode_reason: modeDecision.reason,
      suggested_tools: [],
      has_tool_use: false,
      final_reply: undefined,
      pending_tools: [],
      next_action: undefined,
    };

    logger.info({
      event: 'director.analyze.completed',
      mode: modeDecision.mode,
      reason: modeDecision.reason,
    });

    if (messageContext?.send_message) {
      await messageContext.send_message('', SegmentType.STATE_CHANGE, {
        execution_mode: modeName(modeDecision.mode),
      });
    }

    return result;
  };
}

const DIRECT_SYSTEM_PROMPT = `你现在的职责是作为 branch code，围绕当前用户任务做出下一步执行决策，并在需要时调用合适的工具完成工作。

如果历史对话中上一条提到了 plan.md，并且当前用户消息表达了批准/继续执行方案的语义，那么你应先使用 read_file 读取该 plan.md，再严格遵守该计划执行；否则不要因为工作区里存在 plan.md 就默认按计划执行。

你必须且只能返回以下三种 JSON 结构之一，不要输出额外文本：

1. 调用工具：
{
  "kind": "tool",
  "tool_name": "工具名",
  "tool_args": {"参数名": "参数值"},
  "task_description": "调用当前步骤的原因"
}

2. 当前 todo 已完成：
{
  "kind": "step_done"
}

3. 当前无法继续：
{
  "kind": "blocked",
  "reply": "阻塞原因"
}

规则：
1. 一次只能决定一步，不要输出多步计划
2. 如果用户的问题里提到了文件路径，且该文件存在，优先使用工具读取文件内容并根据内容决策下一步
3. kind=tool 时，tool_name 必填，tool_args 必填，task_description 必填
4. kind=tool 时，tool_name 必须来自工具协议里的工具名，tool_args 必须严格使用协议里的参数名
5. kind=blocked 时，不要返回 tool_name 或 tool_args
6. 如果任务明显复杂、多阶段、跨文件、需要先输出方案，或者用户明确要求先给方案/计划，优先调用 switch_execution_mode 把模式切到 PLAN
7. 如果当前任务是多步骤/有阶段或是任务执行过程中有不确定因素不能一口气完成的，使用 update_todo 写入完整 todo 列表
8. 如果 todo 不为空，优先围绕完整 todo 列表继续执行，并通过 update_todo 覆盖更新完整列表与 doingIdx
9. 如果任务拆分发生变化，直接用 update_todo 重写整个 todo 列表
10. 只有当前工作真的完成时，才能返回 step_done
11. 如果拿不准下一步该用什么工具或缺少必填参数，返回 blocked，不要返回不完整的 tool JSON
12. 如果发现现有工具无法解决用户的问题，例如读取二进制文件、处理特定格式文件，但你刚好没有能处理这类文件工具时，可以使用 chat 工具向用户说明情况。
13. 当需要向用户输出最终回复或回答用户问题时，必须使用 chat 工具，不要尝试返回其他格式。`;

const PLAN_MODE_SYSTEM_PROMPT = `你现在的职责是作为规划代理，围绕当前用户任务进行探索和分析，最终生成一个完整的执行计划。

## 权限说明
- 你可以使用只读工具进行探索
- 你只能写入 plan.md 文件，禁止写入任何其他文件
- 禁止编写任何代码实现，只做规划和分析

## 输出格式
你必须且只能返回以下三种 JSON 结构之一：

1. 调用工具：
{
  "kind": "tool",
  "tool_name": "工具名",
  "tool_args": {"参数名": "参数值"},
  "task_description": "调用当前步骤的原因"
}

2. 计划已完成：
{
  "kind": "step_done"
}

3. 当前无法继续：
{
  "kind": "blocked",
  "reply": "阻塞原因"
}

## 规则
1. 探索阶段：使用只读工具了解代码库、需求背景
2. 规划阶段：将计划写入 plan.md，格式为 Markdown
3. 严禁写入 plan.md 以外的任何文件
4. 严禁编写代码实现，只输出规划文档
5. 完成后使用 chat 工具向用户总结计划并询问是否执行
6. 用户确认后，使用 switch_execution_mode 切换到 DIRECT 模式

## 计划文档结构要求

生成的 plan.md 必须包含以下章节：

### # Context
描述问题背景、当前状态、改造目标。说明为什么要做这个任务，解决什么问题。

### # Recommended approach
分步骤的推荐方案，每步包含：
- **具体要做什么**：清晰描述这一步的目标
- **实现原则**：关键的设计决策和约束
- **优先修改文件**：列出需要改动的文件路径
- **复用点**：可以复用的现有代码/接口

### # Critical files to modify
列出所有需要修改的关键文件路径。

### # Specific reuse points
列出可以复用的现有代码、接口、函数。

### # Verification
验证计划，包含：
- 功能验证：如何验证功能正确
- 回归验证：如何确保不影响现有功能
- 边界验证：异常情况如何处理

### # Key constraints
关键约束和注意事项，避免执行时踩坑。

## 计划质量要求
1. 每个步骤要有明确的完成条件
2. 文件路径要准确，不要猜测不存在的文件
3. 复用点要具体到函数名/接口名
4. 验证计划要可执行，不要泛泛而谈
5. 约束要具体，避免执行时产生歧义
`;

function hasImageParts(parts: unknown[]): boolean {
  if (!parts || !Array.isArray(parts)) return false;
  return parts.some((p: any) => {
    if (!p || typeof p !== 'object') return false;
    const type = (p as Record<string, unknown>).type;
    return type === 'image' || type === 'image_url';
  });
}

function shouldUseNativeMultimodalChat(state: AgentState): boolean {
  const currentAgentType = state.agent_type || 'director_agent';
  if (currentAgentType !== 'director_agent') return false;
  const userMessageParts = state.current_user_message_parts || [];
  return hasImageParts(userMessageParts as unknown[]);
}

function buildNativeMultimodalChatTask(state: AgentState): Partial<AgentState> {
  const userMessage = state.current_user_message_text || getLastUserMessageText(state);
  const userMessageParts = state.current_user_message_parts || [];
  const chatTask = userMessage || '请直接分析这张图片并回答用户。';
  const toolArgs: Record<string, unknown> = {
    description: chatTask,
    multimodal_parts: userMessageParts,
  };

  return {
    pending_tools: [{ tool: 'chat', args: toolArgs }],
    has_tool_use: true,
    next_action: {
      kind: 'tool',
      tool_name: 'chat',
      tool_args: toolArgs,
      task_description: chatTask,
    } as NextAction,
    mode_reason: '检测到图片输入，DIRECT 模式直接走原生多模态 chat',
  };
}

export function createDecideNode(messageContext?: MessageContext) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const userMessage = getLastUserMessageText(state);

    const executionMode = state.execution_mode;
    const isPlanMode = modeName(executionMode) === 'PLAN';

    const currentAgentType = isPlanMode ? 'plan_agent' : (state.agent_type || 'director_agent');

    const toolHistory = state.tool_history || [];
    const lastToolResult = state.last_tool_result;
    const parentChainMessages = state.parent_chain_messages || [];
    const currentConversationMessages = state.current_conversation_messages || [];
    const iterationCount = state.iteration_count || 0;
    const maxIterations = state.max_iterations || 32;
    const todos = state.todos || [];

    logger.info({
      event: 'director.decide.entry',
      mode: isPlanMode ? 'PLAN' : 'DIRECT',
      iteration: `${iterationCount + 1}/${maxIterations}`,
    });

    if (!isPlanMode && shouldUseNativeMultimodalChat(state)) {
      logger.info({ event: 'director.decide.multimodal_detected' });
      return buildNativeMultimodalChatTask(state);
    }

    if (iterationCount >= maxIterations) {
      const reply = '抱歉，当前任务在限定步骤内未完成。我已经停止继续调用工具，请你细化要求或分步执行。';
      emitFinalReply(reply, messageContext);
      return {
        next_action: { kind: 'reply', reply, task_description: '达到最大迭代次数，向用户说明' },
        final_reply: reply,
        has_tool_use: false,
        pending_tools: [],
        iteration_count: iterationCount,
      };
    }

    if (shouldCheckLoop(iterationCount)) {
      const checkResult = await checkLoopOrStuck(
        toolHistory,
        iterationCount,
        userMessage,
        currentConversationMessages as Array<{ role: string; content: string }>,
        todos,
      );
      if (checkResult.action === 'stop') {
        const reason = checkResult.reason || '检测到循环或卡死';
        const reply = `抱歉，检测到任务执行出现循环或卡死情况（${reason}）。我已经停止继续调用工具，请你细化要求或分步执行。`;
        emitFinalReply(reply, messageContext);
        return {
          next_action: { kind: 'reply', reply, task_description: `循环检测停止: ${reason}` },
          final_reply: reply,
          has_tool_use: false,
          pending_tools: [],
          iteration_count: iterationCount,
        };
      }
    }

    const allowedTools = getAllowedTools(currentAgentType);
    const toolSchemaPrompt = toolRegistry.generateToolPrompt(allowedTools);

    const historyLines = toolHistory.slice(-5).map((item, idx) => {
      const resultText = String(item.result || '');
      const truncated = resultText.length > 500 ? resultText.slice(0, 500) + '...' : resultText;
      return `${idx + 1}. tool=${item.tool} args=${JSON.stringify(item.args || {})} result=${truncated}`;
    });
    const historyBlock = historyLines.join('\n') || '(暂无工具执行历史)';

    const lastResultBlock = lastToolResult
      ? (lastToolResult.length > 1000 ? lastToolResult.slice(0, 1000) + '...' : lastToolResult)
      : '(无)';

    const currentTodoIndex = state.current_todo_index || 0;
    const todoBlock = formatTodoPromptBlock(todos, currentTodoIndex);
    const todoIntro = todoBlock ? `\n\n${todoBlock}\n\n` : '';

    let planIntro = '';
    if (!isPlanMode && state.workspace_id) {
      const planReadResult = planFileService.readPlan(state.workspace_id);
      if (planReadResult.success && planReadResult.content) {
        planIntro = `\n\n[工作区存在 plan.md，内容如下]\n${planReadResult.content}\n\n如果用户消息表达了批准/继续执行该计划的语义，请严格按计划执行；否则不要因为存在 plan.md 就默认按计划执行。\n`;
      }
    }

    const currentTask = [
      `原始用户请求: ${userMessage}`,
      `当前工作区ID: ${state.workspace_id}`,
      `已执行轮次: ${iterationCount}/${maxIterations}`,
      '',
      toolSchemaPrompt,
      todoIntro,
      planIntro,
      `最近工具结果:`,
      lastResultBlock,
      '',
      `最近工具历史:`,
      historyBlock,
      '',
      isPlanMode
        ? '请只决定下一步动作，并以 JSON 形式返回：如果需要继续操作，返回一个 tool 调用；如果计划已完成，返回 kind=step_done；如果需要向用户输出回复，使用 chat 工具；如果无法继续，返回 kind=blocked。'
        : '注意：只有当 todo 列表非空时，你才应围绕 todo 执行；如果当前没有 todo 且任务明显多步骤/阶段化，可以先使用 update_todo 写入完整 todo 列表。默认按 DIRECT 执行；如果你在执行过程中发现任务明显复杂、多阶段、跨文件、需要先输出方案，才调用 switch_execution_mode 把模式切到 PLAN。请只决定下一步动作，并以 JSON 形式返回。',
    ].join('\n');

    const systemPrompt = isPlanMode ? PLAN_MODE_SYSTEM_PROMPT : DIRECT_SYSTEM_PROMPT;
    const contextPrompt = buildContextPrompt(
      parentChainMessages as Array<Record<string, unknown>>,
      currentConversationMessages as Array<Record<string, unknown>>,
      currentTask,
    );
    logger.info({ event: 'director.decide.prompt_length', system: systemPrompt.length, context: contextPrompt.length, total: systemPrompt.length + contextPrompt.length });

    let responseText = '';
    try {
      const response = await llmService.chat(
        [{ role: 'user', content: contextPrompt }],
        systemPrompt,
      );
      responseText = stripCodeBlock(response);
      logger.info({ event: 'director.decide.raw_response', response: responseText.slice(0, 1000), full_length: responseText.length });
      let decisionData: Record<string, unknown>;
      try {
        decisionData = JSON.parse(responseText);
      } catch (parseErr) {
        logger.error({ event: 'director.decide.parse_error', error: String(parseErr), raw_response: responseText.slice(0, 500) });
        throw parseErr;
      }
      logger.info({ event: 'director.decide.parsed', kind: decisionData.kind, tool_name: decisionData.tool_name, keys: Object.keys(decisionData) });

      const kind = decisionData.kind;

      if (kind === 'step_done') {
        return {
          todo_status: 'step_done',
          has_tool_use: false,
          pending_tools: [],
        };
      }

      if (kind === 'blocked') {
        const reply = (decisionData.reply as string) || '当前 todo 被阻塞';
        emitFinalReply(reply, messageContext);
        return {
          todo_status: 'blocked',
          final_reply: reply,
          has_tool_use: false,
          pending_tools: [],
        };
      }

      const toolName = decisionData.tool_name as string;
      const toolArgs = (decisionData.tool_args || {}) as Record<string, unknown>;
      const taskDescription = (decisionData.task_description || userMessage) as string;

      if (!toolName || !isToolAllowed(toolName, currentAgentType)) {
        const retryCount = (state.invalid_tool_retry_count || 0) + 1;
        if (retryCount <= 3) {
          logger.warn({
            event: 'director.decide.invalid_tool',
            tool_name: toolName,
            retry: retryCount,
          });
          return {
            pending_tools: [],
            has_tool_use: false,
            final_reply: undefined,
            next_action: undefined,
            invalid_tool_retry_count: retryCount,
          };
        }

        const reply = `工具决策无效，无法继续执行：${toolName}`;
        emitFinalReply(reply, messageContext);
        return {
          next_action: { kind: 'reply', reply, task_description: taskDescription },
          final_reply: reply,
          has_tool_use: false,
          pending_tools: [],
          invalid_tool_retry_count: retryCount,
        };
      }

      const pending: ToolCall[] = [{ tool: toolName, args: toolArgs }];
      return {
        next_action: {
          kind: 'tool',
          tool_name: toolName,
          tool_args: toolArgs,
          task_description: taskDescription,
        },
        pending_tools: pending,
        has_tool_use: true,
        final_reply: undefined,
        invalid_tool_retry_count: 0,
      };
    } catch (err) {
      const reply = `当前无法自动决策下一步：${String(err)}`;
      emitFinalReply(reply, messageContext);
      return {
        next_action: { kind: 'reply', reply, task_description: userMessage },
        final_reply: reply,
        has_tool_use: false,
        pending_tools: [],
      };
    }
  };
}

export function createStepReviewNode() {
  return (state: AgentState): Partial<AgentState> => {
    const todos = state.todos || [];
    const currentTodoIndex = state.current_todo_index || 0;

    if (!todos || todos.length === 0) {
      return {
        todo_status: 'continue',
        has_tool_use: false,
        pending_tools: [],
        todos,
      };
    }

    if (currentTodoIndex >= todos.length) {
      return { final_reply: '任务已完成。', has_tool_use: false };
    }

    if (state.last_tool_success === false) {
      return {
        todo_status: 'blocked',
        has_tool_use: false,
        pending_tools: [],
        todos,
      };
    }

    return {
      todo_status: state.todo_status || 'continue',
      has_tool_use: false,
      pending_tools: [],
      todos,
    };
  };
}

export function createExecuteNode(messageContext?: MessageContext) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    if (messageContext?.cancel_check) {
      messageContext.cancel_check();
    }

    const pendingTools = state.pending_tools || [];
    const currentAgentType = state.agent_type || 'director_agent';
    const currentConversationMessages = state.current_conversation_messages || [];
    const workspaceId = state.workspace_id;
    const executionMode = state.execution_mode;

    if (pendingTools.length === 0) {
      return {
        pending_tools: [],
        has_tool_use: false,
      };
    }

    const toolCall = pendingTools[0];
    const toolName = toolCall.tool;
    const toolArgs = toolCall.args || {};
    const taskDescription = state.next_action?.task_description || (toolArgs.description as string) || (toolArgs.task_description as string) || '';

    logger.info({
      event: 'director.execute.started',
      tool_name: toolName,
      workspace_id: workspaceId,
    });

    if (toolName === 'chat') {
      const chatResult = await _executeChatToolDirect(
        taskDescription || state.current_user_message_text || '',
        messageContext,
        (state.parent_chain_messages || []) as Array<Record<string, unknown>>,
        (state.current_conversation_messages || []) as Array<Record<string, unknown>>,
      );

      const newToolHistory: ToolCall[] = [
        ...state.tool_history,
        { tool: toolName, args: toolArgs, result: chatResult },
      ];

      const newCurrentConvMsgs = [...currentConversationMessages];
      newCurrentConvMsgs.push({ role: 'assistant', content: chatResult.slice(0, 1000) } as Record<string, unknown>);

      return {
        pending_tools: pendingTools.slice(1),
        tool_history: newToolHistory,
        current_conversation_messages: newCurrentConvMsgs,
        has_tool_use: false,
        final_reply: chatResult,
        last_tool_result: chatResult.length > 4000 ? chatResult.slice(0, 4000) + '...' : chatResult,
        last_tool_name: toolName,
        last_tool_success: true,
        last_tool_error: undefined,
        next_action: undefined,
      };
    }

    if (toolName === 'thinking') {
      const thinkingResult = await _executeThinkingToolDirect(
        taskDescription || state.current_user_message_text || '',
        messageContext,
        (state.parent_chain_messages || []) as Array<Record<string, unknown>>,
        (state.current_conversation_messages || []) as Array<Record<string, unknown>>,
      );

      const newToolHistory: ToolCall[] = [
        ...state.tool_history,
        { tool: toolName, args: toolArgs, result: thinkingResult },
      ];

      const newCurrentConvMsgs = [...currentConversationMessages];
      newCurrentConvMsgs.push({ role: 'assistant', content: `[思考结果]: ${thinkingResult.slice(0, 500)}` } as Record<string, unknown>);

      const hasMoreTools = pendingTools.length > 1;

      return {
        pending_tools: pendingTools.slice(1),
        tool_history: newToolHistory,
        current_conversation_messages: newCurrentConvMsgs,
        has_tool_use: hasMoreTools,
        last_tool_result: thinkingResult.length > 4000 ? thinkingResult.slice(0, 4000) + '...' : thinkingResult,
        last_tool_name: toolName,
        last_tool_success: true,
        last_tool_error: undefined,
      };
    }

    if (toolName === 'call_explore_agent' || toolName === 'call_review_agent') {
      const subAgentType = toolName === 'call_explore_agent' ? 'explore_agent' : 'review_agent';
      const subTaskDescription = (toolArgs.task_description as string) || (toolArgs.description as string) || taskDescription;

      if (messageContext?.send_message) {
        await messageContext.send_message('', SegmentType.TOOL_CALL, {
          tool_name: toolName,
          tool_args: toolArgs,
          task_description: subTaskDescription,
          agent_type: subAgentType,
        });
      }

      let subResult: string;
      let subError: string | null = null;

      const SUBAGENT_TIMEOUT_MS = 45000;

      try {
        const outcome = await Promise.race([
          runAgentGraph(
            subAgentType,
            subTaskDescription,
            workspaceId,
            messageContext,
            (state.parent_chain_messages || []) as Array<Record<string, unknown>>,
            (state.current_conversation_messages || []) as Array<Record<string, unknown>>,
            'DIRECT',
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`子代理 ${subAgentType} 执行超时（${SUBAGENT_TIMEOUT_MS / 1000}秒）`)), SUBAGENT_TIMEOUT_MS)
          ),
        ]);

        if (outcome.status === 'completed' && outcome.payload) {
          subResult = outcome.payload;
        } else if (outcome.status === 'failed') {
          subResult = outcome.exit_info.message || '子代理执行失败';
          subError = outcome.exit_info.message || '子代理执行失败';
        } else {
          subResult = outcome.exit_info.message || '子代理未产生有效输出';
          subError = '子代理未产生有效输出';
        }
      } catch (err) {
        subResult = String(err);
        subError = String(err);
      }

      if (messageContext?.send_message) {
        await messageContext.send_message('', SegmentType.TOOL_RES, {
          tool_name: toolName,
          result: subResult.slice(0, 500),
          error: subError,
          success: subError === null,
        });
      }

      const newToolHistory: ToolCall[] = [
        ...state.tool_history,
        { tool: toolName, args: toolArgs, result: subResult },
      ];

      const newCurrentConvMsgs = [...currentConversationMessages];
      const content = subError
        ? `[子代理 ${subAgentType} 执行失败]: ${subResult.slice(0, 500)}`
        : `[子代理 ${subAgentType} 执行结果]: ${subResult.slice(0, 1000)}`;
      newCurrentConvMsgs.push({ role: 'assistant', content } as Record<string, unknown>);

      const truncatedResult = subResult.length > 4000 ? subResult.slice(0, 4000) + '...' : subResult;

      if (modeName(executionMode) === 'DIRECT') {
        return {
          pending_tools: [],
          tool_history: newToolHistory,
          current_conversation_messages: newCurrentConvMsgs,
          has_tool_use: false,
          last_tool_result: truncatedResult,
          last_tool_name: toolName,
          last_tool_success: subError === null,
          last_tool_error: subError || undefined,
          iteration_count: (state.iteration_count || 0) + 1,
          current_todo_iteration_count: (state.current_todo_iteration_count || 0) + 1,
          todo_status: 'in_progress',
          next_action: undefined,
        };
      }

      return {
        pending_tools: pendingTools.slice(1),
        tool_history: newToolHistory,
        current_conversation_messages: newCurrentConvMsgs,
        has_tool_use: pendingTools.length > 1,
        last_tool_result: truncatedResult,
        last_tool_name: toolName,
        last_tool_success: subError === null,
        last_tool_error: subError || undefined,
      };
    }

    if (messageContext?.send_message) {
      await messageContext.send_message('', SegmentType.TOOL_CALL, {
        tool_name: toolName,
        tool_args: toolArgs,
        task_description: taskDescription,
      });
    }

    let toolResult: { result: unknown; error: string | null };

    toolResult = await runToolExecution({
      toolName,
      toolArgs,
      workspaceId,
      agentType: currentAgentType,
      previousCalls: state.tool_history,
    });

    let duplicateCount = 0;
    for (const call of state.tool_history) {
      if (call.tool === toolName && JSON.stringify(call.args) === JSON.stringify(toolArgs)) {
        duplicateCount++;
      }
    }
    if (duplicateCount >= 3 && toolResult.error === null) {
      logger.warn({
        event: 'doom_loop.detected',
        tool_name: toolName,
        duplicate_count: duplicateCount,
      });
      toolResult = { result: null, error: 'DoomLoop detected: repeated tool calls with identical args' };
      if (messageContext?.send_message) {
        await messageContext.send_message('DoomLoop detected: repeated tool calls', SegmentType.ERROR, { source: 'doom_loop' });
      }
    }

    const resultStr = toolResult.result ? String(toolResult.result) : '';
    const truncatedResult = resultStr.length > 4000 ? resultStr.slice(0, 4000) + '...' : resultStr;

    if (messageContext?.send_message) {
      await messageContext.send_message('', SegmentType.TOOL_RES, {
        tool_name: toolName,
        result: truncatedResult,
        error: toolResult.error,
        success: toolResult.error === null,
      });
    }

    const newToolHistory: ToolCall[] = [
      ...state.tool_history,
      { tool: toolName, args: toolArgs, result: resultStr },
    ];

    const newCurrentConvMsgs = [...currentConversationMessages];
    const toolError = toolResult.error;
    let content = `[工具执行: ${toolName}]\n结果: ${resultStr.slice(0, 1000)}`;
    if (toolError) content += `\n错误: ${toolError}`;
    newCurrentConvMsgs.push({ role: 'assistant', content } as Record<string, unknown>);

    const toolSuccess = toolResult.error === null;

    if (toolSuccess && toolName === 'write_file') {
      const filePath = (toolArgs.file_path as string) || (toolArgs.path as string) || '';
      if (filePath.endsWith('plan.md') && modeName(executionMode) === 'PLAN') {
        const planContent = (toolArgs.content as string) || '';
        planFileService.createPlan(workspaceId, planContent, state.plan || []);
      }
    }

    if (modeName(executionMode) === 'DIRECT') {
      const directUpdate: Partial<AgentState> = {
        pending_tools: [],
        tool_history: newToolHistory,
        current_conversation_messages: newCurrentConvMsgs,
        has_tool_use: false,
        last_tool_result: truncatedResult,
        last_tool_name: toolName,
        last_tool_success: toolSuccess,
        last_tool_error: toolError || undefined,
        iteration_count: (state.iteration_count || 0) + 1,
        current_todo_iteration_count: (state.current_todo_iteration_count || 0) + 1,
        todo_status: 'in_progress',
        next_action: undefined,
      };

      if (toolSuccess && toolName === 'update_todo') {
        const toolResultData = toolResult.result as Record<string, unknown> | null;
        const nextTodos = (toolResultData?.todos as TodoItem[]) || [];
        const nextDoingIdx = (toolResultData?.current_todo_index as number) || 0;
        directUpdate.todos = nextTodos;
        directUpdate.current_todo_index = nextDoingIdx;
        directUpdate.current_todo_goal = toolResultData?.current_todo_goal as string | undefined;
        directUpdate.current_todo_done_when = toolResultData?.current_todo_done_when as string | undefined;
        directUpdate.iteration_count = 0;
        directUpdate.current_todo_iteration_count = 0;
        directUpdate.todo_status = 'pending';
      }

      if (toolSuccess && toolName === 'switch_execution_mode') {
        const toolResultObj = toolResult as Record<string, unknown>;
        const modeValue = toolResultObj.execution_mode as string;
        if (modeValue === 'PLAN') {
          directUpdate.execution_mode = 'PLAN';
          directUpdate.mode_reason = (toolResultObj.mode_reason as string) || 'agent 主动切换到 PLAN';
          directUpdate.pending_tools = [];
          directUpdate.has_tool_use = false;
          directUpdate.next_action = {
            kind: 'enter_plan',
            task_description: (toolResultObj.mode_reason as string) || '切换到 PLAN',
          };
        } else if (modeValue === 'DIRECT') {
          directUpdate.execution_mode = 'DIRECT';
          directUpdate.mode_reason = (toolResultObj.mode_reason as string) || 'agent 维持 DIRECT';
        }
      }

      return directUpdate;
    }

    const hasMoreTools = pendingTools.length > 1;

    return {
      pending_tools: pendingTools.slice(1),
      tool_history: newToolHistory,
      current_conversation_messages: newCurrentConvMsgs,
      has_tool_use: hasMoreTools,
      last_tool_result: truncatedResult,
      last_tool_name: toolName,
      last_tool_success: toolSuccess,
      last_tool_error: toolError || undefined,
    };
  };
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
  explore_result: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  tool_history: { value: (a: unknown[], b: unknown[]) => a.concat(b), default: () => [] },
  replan_count: { value: (_a: unknown, b: unknown) => b, default: () => 0 },
  agent_type: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  is_root_graph: { value: (_a: unknown, b: unknown) => b, default: () => true },
  intent_analysis: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
  parent_chain_messages: { value: (a: unknown[], b: unknown[]) => a.concat(b), default: () => [] },
  current_conversation_messages: { value: (a: unknown[], b: unknown[]) => a.concat(b), default: () => [] },
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
};

export function createOrchestratorGraph(messageContext?: MessageContext) {
  const graph = new StateGraph({
    channels: AgentStateChannels,
  } as any);

  graph.addNode('analyze', createAnalyzeNode(messageContext));
  graph.addNode('decide', createDecideNode(messageContext));
  graph.addNode('todo_review', createStepReviewNode());
  graph.addNode('execute', createExecuteNode(messageContext));

  (graph as any).addEdge(START, 'analyze');

  (graph as any).addConditionalEdges('analyze', routeAfterAnalyze, {
    decide: 'decide',
    execute: 'execute',
    done: END,
  });

  (graph as any).addConditionalEdges('decide', checkState, {
    analyze: 'analyze',
    decide: 'decide',
    execute: 'execute',
    done: END,
  });

  (graph as any).addConditionalEdges('execute', routeAfterExecute, {
    analyze: 'analyze',
    decide: 'decide',
    todo_review: 'todo_review',
    execute: 'execute',
    done: END,
  });

  (graph as any).addConditionalEdges('todo_review', routeAfterTodoReview, {
    decide: 'decide',
  });

  return graph.compile();
}

export async function runDirectorGraph(
  userMessage: string,
  workspaceId: string,
  messageContext?: MessageContext,
  parentChainMessages?: Array<Record<string, unknown>>,
  currentConversationMessages?: Array<Record<string, unknown>>,
  agentType?: string,
  forcedExecutionMode?: 'DIRECT' | 'PLAN',
): Promise<AgentState> {
  logger.info({
    event: 'director_graph.started',
    workspace_id: workspaceId,
    agent_type: agentType || 'director_agent',
  });

  const initialState: AgentState = {
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
    agent_type: agentType || 'director_agent',
    is_root_graph: true,
    parent_chain_messages: parentChainMessages || [],
    current_conversation_messages: currentConversationMessages || [],
    execution_mode: undefined,
    mode_reason: undefined,
    suggested_tools: [],
    in_plan_mode: false,
    pending_tools: [],
    has_tool_use: false,
    final_reply: undefined,
    plan_file: undefined,
    plan_content: undefined,
    forced_execution_mode: forcedExecutionMode,
    last_tool_result: undefined,
    last_tool_name: undefined,
    last_tool_success: undefined,
    last_tool_error: undefined,
    iteration_count: 0,
    max_iterations: 32,
    todos: [],
    current_todo_index: 0,
    current_todo_goal: undefined,
    current_todo_done_when: undefined,
    current_todo_iteration_count: 0,
    todo_max_iterations: 32,
    todo_status: undefined,
    next_action: undefined,
  };

  const graph = createOrchestratorGraph(messageContext);
  const finalState = await graph.invoke(initialState, { recursionLimit: 50 });

  logger.info({
    event: 'director_graph.completed',
    workspace_id: workspaceId,
    has_final_reply: !!finalState.final_reply,
  });

  return finalState as AgentState;
}
