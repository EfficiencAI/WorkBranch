import { StateGraph, END, START } from '@langchain/langgraph';
import type { AgentState, NextAction, ToolCall, TodoItem, IntentAnalysis } from '../../state/agent-state';
import { ExecutionMode } from '../decision/complexity-analyzer';
import { checkLoopOrStuck, shouldCheckLoop, CHECK_INTERVAL } from './loop-detection';
import { runToolExecution } from '../subgraphs/tool-execution-graph';
import { llmService } from '../../service/llm-service';
import { SegmentType } from '../../../session-service/canonical';
import { logger } from '../../../../core/logging';

export interface MessageContext {
  send_message?: (content: string, type: SegmentType, metadata?: Record<string, unknown>) => void;
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
  return (state: AgentState): Partial<AgentState> => {
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
      messageContext.send_message('', SegmentType.STATE_CHANGE, {
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
12. 如果发现现有工具无法解决用户的问题，可以使用 chat 工具向用户说明情况
13. 当需要向用户输出最终回复或回答用户问题时，必须使用 chat 工具，不要尝试返回其他格式`;

const PLAN_MODE_SYSTEM_PROMPT = `你现在的职责是作为 plan agent，在规划模式下按步骤执行任务。

你必须且只能返回以下三种 JSON 结构之一：

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
1. 一次只能决定一步
2. 严格按照计划步骤执行
3. 如果需要向用户输出回复，使用 chat 工具
4. 如果无法继续，返回 blocked`;

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

    const currentTask = [
      `原始用户请求: ${userMessage}`,
      `当前工作区ID: ${state.workspace_id}`,
      `已执行轮次: ${iterationCount}/${maxIterations}`,
      '',
      `工具列表: ${allowedTools.join(', ')}`,
      todoIntro,
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

    let responseText = '';
    try {
      const response = await llmService.chat(
        [{ role: 'user', content: contextPrompt }],
        systemPrompt,
      );
      responseText = stripCodeBlock(response);
      const decisionData = JSON.parse(responseText);

      const kind = decisionData.kind;

      if (kind === 'step_done') {
        return {
          todo_status: 'step_done',
          has_tool_use: false,
          pending_tools: [],
        };
      }

      if (kind === 'blocked') {
        const reply = decisionData.reply || '当前 todo 被阻塞';
        emitFinalReply(reply, messageContext);
        return {
          todo_status: 'blocked',
          final_reply: reply,
          has_tool_use: false,
          pending_tools: [],
        };
      }

      const toolName = decisionData.tool_name;
      const toolArgs = decisionData.tool_args || {};
      const taskDescription = decisionData.task_description || userMessage;

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

async function executeChatTool(
  taskDescription: string,
  state: AgentState,
  messageContext?: MessageContext,
): Promise<{ result: string; error: string | null }> {
  try {
    const parentChainMessages = state.parent_chain_messages || [];
    const currentConversationMessages = state.current_conversation_messages || [];

    const fullPrompt = buildContextPrompt(
      parentChainMessages as Array<Record<string, unknown>>,
      currentConversationMessages as Array<Record<string, unknown>>,
      taskDescription,
    );

    if (messageContext?.send_message) {
      messageContext.send_message('', SegmentType.CHAT_START, {
        task_description: taskDescription,
        is_start: true,
      });
    }

    let result = '';
    for await (const chunk of llmService.chatStream([{ role: 'user', content: fullPrompt }])) {
      result += chunk;
      if (messageContext?.send_message) {
        messageContext.send_message(chunk, SegmentType.CHAT_DELTA, {
          task_description: taskDescription,
          is_delta: true,
        });
      }
    }

    if (messageContext?.send_message) {
      messageContext.send_message('', SegmentType.CHAT_END, {
        task_description: taskDescription,
        is_end: true,
        result,
      });
    }

    return { result, error: null };
  } catch (err) {
    return { result: '', error: String(err) };
  }
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
    const taskDescription = state.next_action?.task_description || (toolArgs.description as string) || '';

    logger.info({
      event: 'director.execute.started',
      tool_name: toolName,
      workspace_id: workspaceId,
    });

    let toolResult: { result: unknown; error: string | null };

    if (toolName === 'chat') {
      toolResult = await executeChatTool(taskDescription, state, messageContext);
    } else {
      toolResult = await runToolExecution({
        toolName,
        toolArgs,
        workspaceId,
        agentType: currentAgentType,
        previousCalls: state.tool_history,
      });
    }

    const resultStr = toolResult.result ? String(toolResult.result) : '';
    const truncatedResult = resultStr.length > 4000 ? resultStr.slice(0, 4000) + '...' : resultStr;

    const newToolHistory: ToolCall[] = [
      ...state.tool_history,
      { tool: toolName, args: toolArgs, result: toolResult.result },
    ];

    const newCurrentConvMsgs = [...currentConversationMessages];
    const toolError = toolResult.error;
    let content = `[工具执行: ${toolName}]\n结果: ${resultStr.slice(0, 1000)}`;
    if (toolError) content += `\n错误: ${toolError}`;
    newCurrentConvMsgs.push({ role: 'assistant', content } as Record<string, unknown>);

    const toolSuccess = toolResult.error === null;

    if (modeName(executionMode) === 'DIRECT' && toolName !== 'chat') {
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
        const toolResultData = toolResult.result as Record<string, unknown> | null;
        const modeValue = toolResultData as string || '';
        if (modeValue === 'PLAN') {
          directUpdate.execution_mode = ExecutionMode.PLAN;
          directUpdate.mode_reason = 'agent 主动切换到 PLAN';
          directUpdate.pending_tools = [];
          directUpdate.has_tool_use = false;
          directUpdate.next_action = {
            kind: 'enter_plan',
            task_description: '切换到 PLAN',
          };
        } else if (modeValue === 'DIRECT') {
          directUpdate.execution_mode = ExecutionMode.DIRECT;
          directUpdate.mode_reason = 'agent 主动切换到 DIRECT';
        }
      }

      return directUpdate;
    }

    const hasMoreTools = pendingTools.length > 1;
    const isChatTool = toolName === 'chat';

    if (isChatTool) {
      return {
        pending_tools: pendingTools.slice(1),
        tool_history: newToolHistory,
        current_conversation_messages: newCurrentConvMsgs,
        has_tool_use: false,
        final_reply: resultStr,
        last_tool_result: truncatedResult,
        last_tool_name: toolName,
        last_tool_success: toolSuccess,
        last_tool_error: toolError || undefined,
        next_action: undefined,
      };
    }

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
  });

  graph.addNode('analyze', createAnalyzeNode(messageContext));
  graph.addNode('decide', createDecideNode(messageContext));
  graph.addNode('todo_review', createStepReviewNode());
  graph.addNode('execute', createExecuteNode(messageContext));

  graph.addEdge(START, 'analyze');

  graph.addConditionalEdges('analyze', routeAfterAnalyze, {
    decide: 'decide',
    execute: 'execute',
    done: END,
  });

  graph.addConditionalEdges('decide', checkState, {
    analyze: 'analyze',
    decide: 'decide',
    execute: 'execute',
    done: END,
  });

  graph.addConditionalEdges('execute', routeAfterExecute, {
    analyze: 'analyze',
    decide: 'decide',
    todo_review: 'todo_review',
    execute: 'execute',
    done: END,
  });

  graph.addConditionalEdges('todo_review', routeAfterTodoReview, {
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
  const finalState = await graph.invoke(initialState);

  logger.info({
    event: 'director_graph.completed',
    workspace_id: workspaceId,
    has_final_reply: !!finalState.final_reply,
  });

  return finalState as AgentState;
}
