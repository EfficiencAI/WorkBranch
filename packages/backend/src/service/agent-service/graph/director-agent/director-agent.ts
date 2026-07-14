import { StateGraph, END, START } from '@langchain/langgraph';
import type { AgentState, NextAction, ToolCall, TodoItem, IntentAnalysis } from '../../state/agent-state';
import { ExecutionMode } from '../decision/complexity-analyzer';
import { runToolExecution } from '../subgraphs/tool-execution-graph';
import { llmService } from '../../service/llm-service';
import { planFileService } from '../../service/plan-file-service';
import { SegmentType } from '../../../session-service/canonical';
import { logger } from '../../../../core/logging';
import { toolRegistry } from '../../tools/registry';
import { isToolAllowed, getAllowedTools } from '../subgraphs/tool-registry';
import { buildContextPrompt, formatTodoPromptBlock, DIRECT_SYSTEM_PROMPT, PLAN_MODE_SYSTEM_PROMPT, THINK_SYSTEM_PROMPT, buildDirectorPlanMessages, buildChatSystemPrompt } from '../../prompts/graph-prompts';
import * as path from 'path';
import * as fs from 'fs';

export interface MessageContext {
  send_message?: (content: string, type: SegmentType, metadata?: Record<string, unknown>) => Promise<void>;
  session_id?: string;
  conversation_id?: string;
  workspace_id?: string;
  message_id?: string;
  cancel_check?: () => void;
  settings_service?: Record<string, unknown>;
}

const CHECK_INTERVAL = 8;

function modeName(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.toUpperCase();
  if (value === ExecutionMode.DIRECT) return 'DIRECT';
  if (value === ExecutionMode.PLAN) return 'PLAN';
  return String(value).split('.').pop()?.toUpperCase() ?? null;
}

export function getLastUserMessageText(state: AgentState): string {
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

function stripCodeBlock(text: string): string {
  let result = text.trim();
  if (result.startsWith('```json')) result = result.slice(7);
  else if (result.startsWith('```')) result = result.slice(3);
  if (result.endsWith('```')) result = result.slice(0, -3);
  return result.trim();
}

function _emitFinalReply(reply: string, messageContext?: MessageContext): void {
  if (!messageContext?.send_message) return;
  const send = messageContext.send_message;
  send('', SegmentType.CHAT_START, { task_description: '输出最终回复', is_start: true });
  if (reply) {
    send(reply, SegmentType.CHAT_DELTA, { task_description: '输出最终回复', is_delta: true });
  }
  send('', SegmentType.CHAT_END, { task_description: '输出最终回复', is_end: true, result: reply });
}

function _buildLoopCheckPrompt(
  toolHistory: ToolCall[],
  iterationCount: number,
  userMessage: string = '',
  conversationHistory: Array<{ role: string; content: string }> = [],
  todos?: TodoItem[],
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

function detectLoopPattern(toolHistory: ToolCall[]): { detected: boolean; pattern?: string } {
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

function shouldCheckLoop(iterationCount: number): boolean {
  return iterationCount > 0 && iterationCount % CHECK_INTERVAL === 0;
}

async function _checkLoopOrStuck(
  toolHistory: ToolCall[],
  iterationCount: number,
  userMessage: string = '',
  conversationHistory: Array<{ role: string; content: string }> = [],
  todos?: TodoItem[],
): Promise<{ action: string; reason: string }> {
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
    const prompt = _buildLoopCheckPrompt(toolHistory, iterationCount, userMessage, conversationHistory, todos);
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
    return { action: 'continue', reason: `检查失败: ${String(err)}` };
  }
}

function _loadPlanContentForState(state: AgentState): { planContent: string | undefined; planFile: string | undefined } {
  const existingContent = state.plan_content;
  const existingPlanFile = state.plan_file;
  if (existingContent) {
    return { planContent: existingContent, planFile: existingPlanFile };
  }

  const workspaceId = state.workspace_id;
  const planReadResult = planFileService.readPlan(workspaceId);
  if (!planReadResult.success) {
    return { planContent: undefined, planFile: existingPlanFile };
  }

  return { planContent: planReadResult.content, planFile: planReadResult.plan_file };
}

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

async function _executeChatToolDirect(
  taskDescription: string,
  messageContext: MessageContext | undefined,
  parentChainMessages: Array<Record<string, unknown>>,
  currentConversationMessages: Array<Record<string, unknown>>,
  _toolArgs?: Record<string, unknown>,
  multimodalParts?: unknown,
): Promise<string> {
  const chatSystemPrompt = buildChatSystemPrompt(!!multimodalParts);

  const fullPrompt = await buildContextPrompt(
    parentChainMessages,
    currentConversationMessages,
    taskDescription,
    messageContext as unknown as Record<string, unknown>,
  );

  if (messageContext?.send_message) {
    await messageContext.send_message('', SegmentType.CHAT_START, {
      task_description: taskDescription,
      is_start: true,
    });
  }

  let result = '';
  try {
    for await (const chunk of llmService.chatStream([{ role: 'user', content: fullPrompt }], chatSystemPrompt)) {
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
  const fullPrompt = await buildContextPrompt(
    parentChainMessages,
    currentConversationMessages,
    taskDescription,
    messageContext as unknown as Record<string, unknown>,
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
      THINK_SYSTEM_PROMPT,
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

function _formatFileSize(size: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  for (const unit of units) {
    if (size < 1024) {
      return `${size.toFixed(1)} ${unit}`;
    }
    size /= 1024;
  }
  return `${size.toFixed(1)} TB`;
}

function _executeReadFile(toolArgs: Record<string, unknown>): { result: string | null; error: string | null } {
  const filePath = (toolArgs.file_path as string) || (toolArgs.path as string);
  if (!filePath) {
    return { result: null, error: '缺少 file_path 参数' };
  }

  try {
    if (!fs.existsSync(filePath)) {
      return { result: null, error: `文件不存在: ${filePath}` };
    }

    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return { result: null, error: `路径是目录而非文件: ${filePath}` };
    }

    const MAX_FILE_SIZE = 1024 * 1024;
    if (stats.size > MAX_FILE_SIZE) {
      return { result: null, error: `文件过大 (${_formatFileSize(stats.size)})，超过1MB限制` };
    }

    const encoding = (toolArgs.encoding as string) || 'utf-8';
    const content = fs.readFileSync(filePath, { encoding: encoding as BufferEncoding });
    return { result: content, error: null };
  } catch (e) {
    return { result: null, error: `读取文件失败: ${String(e)}` };
  }
}

function _executeWriteFile(toolArgs: Record<string, unknown>): { result: string | null; error: string | null } {
  const filePath = (toolArgs.file_path as string) || (toolArgs.path as string);
  if (!filePath) {
    return { result: null, error: '缺少 file_path 参数' };
  }

  const content = toolArgs.content as string;
  if (content === undefined || content === null) {
    return { result: null, error: '缺少 content 参数' };
  }

  const mode = (toolArgs.mode as string) || 'write';
  const encoding = (toolArgs.encoding as string) || 'utf-8';

  try {
    const dirPath = path.dirname(filePath);
    if (dirPath && !fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    const writeMode = mode === 'append' ? 'a' : 'w';
    fs.writeFileSync(filePath, content, { encoding: encoding as BufferEncoding, flag: writeMode });

    const action = mode === 'append' ? '追加' : '写入';
    return { result: `文件${action}成功: ${filePath}`, error: null };
  } catch (e) {
    return { result: null, error: `写入文件失败: ${String(e)}` };
  }
}

function _executeDeleteFile(toolArgs: Record<string, unknown>): { result: string | null; error: string | null } {
  const filePath = (toolArgs.file_path as string) || (toolArgs.path as string);
  if (!filePath) {
    return { result: null, error: '缺少 file_path 参数' };
  }

  try {
    if (!fs.existsSync(filePath)) {
      return { result: null, error: `路径不存在: ${filePath}` };
    }

    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      fs.unlinkSync(filePath);
      return { result: `文件已删除: ${filePath}`, error: null };
    } else if (stats.isDirectory()) {
      fs.rmSync(filePath, { recursive: true });
      return { result: `目录已删除: ${filePath}`, error: null };
    } else {
      return { result: null, error: `未知文件类型: ${filePath}` };
    }
  } catch (e) {
    return { result: null, error: `删除失败: ${String(e)}` };
  }
}

function _executeListDir(toolArgs: Record<string, unknown>): { result: string | null; error: string | null } {
  const dirPath = (toolArgs.directory as string) || (toolArgs.path as string) || (toolArgs.dir_path as string);
  if (!dirPath) {
    return { result: null, error: '缺少 directory 参数' };
  }

  const recursive = toolArgs.recursive as boolean || false;
  const showHidden = toolArgs.show_hidden as boolean || false;

  try {
    if (!fs.existsSync(dirPath)) {
      return { result: null, error: `目录不存在: ${dirPath}` };
    }

    if (!fs.statSync(dirPath).isDirectory()) {
      return { result: null, error: `路径不是目录: ${dirPath}` };
    }

    const resultLines: string[] = [];
    let fileCount = 0;
    let dirCount = 0;

    if (recursive) {
      const walkDir = (currentDir: string) => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!showHidden && entry.name.startsWith('.')) continue;
          const relRoot = path.relative(dirPath, currentDir);
          const prefix = relRoot ? `${relRoot}/` : '';
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            dirCount++;
            resultLines.push(`📁 ${prefix}${entry.name}/`);
            walkDir(fullPath);
          } else {
            fileCount++;
            resultLines.push(`📄 ${prefix}${entry.name}`);
          }
        }
      };
      walkDir(dirPath);
    } else {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!showHidden && entry.name.startsWith('.')) continue;
        if (entry.isDirectory()) {
          dirCount++;
          resultLines.push(`📁 ${entry.name}/`);
        } else {
          fileCount++;
          resultLines.push(`📄 ${entry.name}`);
        }
      }
    }

    const summary = `目录: ${dirPath}\n共 ${dirCount} 个目录, ${fileCount} 个文件`;
    const content = resultLines.length > 0 ? resultLines.join('\n') : '(空目录)';

    return { result: `${summary}\n\n${content}`, error: null };
  } catch (e) {
    return { result: null, error: `列出目录失败: ${String(e)}` };
  }
}

function _executeCreateDir(toolArgs: Record<string, unknown>): { result: string | null; error: string | null } {
  const dirPath = (toolArgs.directory as string) || (toolArgs.path as string) || (toolArgs.dir_path as string);
  if (!dirPath) {
    return { result: null, error: '缺少 directory 参数' };
  }

  try {
    if (fs.existsSync(dirPath)) {
      if (fs.statSync(dirPath).isDirectory()) {
        return { result: `目录已存在: ${dirPath}`, error: null };
      } else {
        return { result: null, error: `路径已存在但不是目录: ${dirPath}` };
      }
    }

    fs.mkdirSync(dirPath, { recursive: true });
    return { result: `目录已创建: ${dirPath}`, error: null };
  } catch (e) {
    return { result: null, error: `创建目录失败: ${String(e)}` };
  }
}

void _executeThinkingToolDirect;
void _executeReadFile;
void _executeWriteFile;
void _executeDeleteFile;
void _executeListDir;
void _executeCreateDir;

export function checkState(state: AgentState): 'analyze' | 'decide' | 'execute' | 'done' {
  if (state.pending_tools && state.pending_tools.length > 0) {
    logger.info({ event: 'route.checkState', target: 'execute', reason: 'has_pending_tools' });
    return 'execute';
  }
  if (state.final_reply) {
    logger.info({ event: 'route.checkState', target: 'done', reason: 'has_final_reply' });
    return 'done';
  }
  if (state.todo_status === 'step_done') {
    logger.info({ event: 'route.checkState', target: 'done', reason: 'todo_step_done' });
    return 'done';
  }
  if (state.todo_status === 'blocked') {
    logger.info({ event: 'route.checkState', target: 'done', reason: 'todo_blocked' });
    return 'done';
  }
  const retryCount = state.invalid_tool_retry_count || 0;
  if (retryCount > 3 && !state.pending_tools?.length && !state.final_reply) {
    logger.info({ event: 'route.checkState', target: 'done', reason: 'invalid_tool_retry_exceeded' });
    return 'done';
  }
  logger.info({ event: 'route.checkState', target: 'decide', reason: 'default', todo_status: state.todo_status, invalid_tool_retry_count: retryCount });
  return 'decide';
}

export function routeAfterAnalyze(state: AgentState): 'decide' | 'execute' | 'done' {
  if (state.pending_tools && state.pending_tools.length > 0) {
    logger.info({ event: 'route.afterAnalyze', target: 'execute' });
    return 'execute';
  }
  logger.info({ event: 'route.afterAnalyze', target: 'decide' });
  return 'decide';
}

export function routeAfterExecute(state: AgentState): 'analyze' | 'decide' | 'todo_review' | 'execute' | 'done' {
  if (state.final_reply) {
    logger.info({ event: 'route.afterExecute', target: 'done', reason: 'has_final_reply' });
    return 'done';
  }

  const nextAction = state.next_action || {} as NextAction;
  if (nextAction.kind === 'enter_plan') {
    logger.info({ event: 'route.afterExecute', target: 'analyze', reason: 'enter_plan' });
    return 'analyze';
  }

  if (state.pending_tools && state.pending_tools.length > 0) {
    logger.info({ event: 'route.afterExecute', target: 'execute', reason: 'has_pending_tools' });
    return 'execute';
  }

  if (modeName(state.execution_mode) === 'DIRECT' && (!state.pending_tools || state.pending_tools.length === 0)) {
    logger.info({ event: 'route.afterExecute', target: 'todo_review', reason: 'DIRECT_no_pending' });
    return 'todo_review';
  }

  return checkState(state);
}

export function routeAfterTodoReview(state: AgentState): 'decide' | 'done' {
  if (state.todo_status === 'step_done') {
    logger.info({ event: 'route.afterTodoReview', target: 'done', reason: 'todo_step_done' });
    return 'done';
  }
  if (state.todo_status === 'blocked' && !state.final_reply) {
    logger.info({ event: 'route.afterTodoReview', target: 'done', reason: 'todo_blocked_no_reply' });
    return 'done';
  }
  logger.info({ event: 'route.afterTodoReview', target: 'decide', reason: 'default', todo_status: state.todo_status });
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

    if (shouldUseNativeMultimodalChat(state)) {
      Object.assign(result, buildNativeMultimodalChatTask(state));
    }

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
      _emitFinalReply(reply, messageContext);
      return {
        next_action: { kind: 'reply', reply, task_description: '达到最大迭代次数，向用户说明' },
        final_reply: reply,
        has_tool_use: false,
        pending_tools: [],
        iteration_count: iterationCount,
      };
    }

    if (shouldCheckLoop(iterationCount)) {
      const checkResult = await _checkLoopOrStuck(
        toolHistory,
        iterationCount,
        userMessage,
        currentConversationMessages as Array<{ role: string; content: string }>,
        todos,
      );
      if (checkResult.action === 'stop') {
        const reason = checkResult.reason || '检测到循环或卡死';
        const reply = `抱歉，检测到任务执行出现循环或卡死情况（${reason}）。我已经停止继续调用工具，请你细化要求或分步执行。`;
        _emitFinalReply(reply, messageContext);
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
    const todoBlock = formatTodoPromptBlock(todos as any, currentTodoIndex);
    const todoIntro = todoBlock ? `\n\n${todoBlock}\n\n` : '';

    let planIntro = '';
    if (!isPlanMode) {
      const { planContent } = _loadPlanContentForState(state);
      if (planContent) {
        planIntro = `\n\n当前工作区存在计划文件: plan.md\n如果上一条历史对话提到了 plan.md，并且当前用户消息表达了批准/继续执行方案的语义，那么你应主动使用 read_file 读取该 plan.md，再严格遵守该计划执行；否则不要因为计划文件存在就默认按计划执行。\n`;
      }
    }

    const currentTask = [
      `原始用户请求: ${userMessage}`,
      `当前工作区ID: ${state.workspace_id}`,
      `已执行轮次: ${iterationCount}/${maxIterations}`,
      '',
      planIntro,
      toolSchemaPrompt,
      todoIntro,
      `最近工具结果:`,
      lastResultBlock,
      '',
      `最近工具历史:`,
      historyBlock,
      '',
      isPlanMode
        ? '请只决定下一步动作，并以 JSON 形式返回：如果需要继续操作，返回一个 tool 调用；如果计划已完成，返回 kind=step_done；如果需要向用户输出回复，使用 chat 工具；如果无法继续，返回 kind=blocked。'
        : '注意：只有当 todo 列表非空时，你才应围绕 todo 执行；如果当前没有 todo 且任务明显多步骤/阶段化，可以先使用 update_todo 写入完整 todo 列表。如果 todo 列表非空，你应继续通过 update_todo 覆盖更新完整 todo 列表和 doingIdx；如果任务拆分发生变化，也应通过 update_todo 一次性重写。默认按 DIRECT 执行；如果你在执行过程中发现任务明显复杂、多阶段、跨文件、需要先输出方案，才调用 switch_execution_mode 把模式切到 PLAN。如果上一条历史对话提到了 plan.md，并且当前用户消息表达了批准/继续执行方案的语义，那么你应先使用 read_file 读取该 plan.md，再严格遵守该计划执行。除非用户明确要求查看计划文件，否则不要为了展示而读取 plan.md。请只决定下一步动作，并以 JSON 形式返回：如果需要继续操作，返回一个 tool 调用；如果当前 todo 已完成，返回 kind=step_done；如果需要向用户输出最终回复，使用 chat 工具；如果无法继续，返回 kind=blocked。',
    ].join('\n');

    const systemPrompt = isPlanMode ? PLAN_MODE_SYSTEM_PROMPT : DIRECT_SYSTEM_PROMPT;
    const contextPrompt = await buildContextPrompt(
      parentChainMessages as Array<Record<string, unknown>>,
      currentConversationMessages as Array<Record<string, unknown>>,
      currentTask,
      messageContext as unknown as Record<string, unknown>,
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
        _emitFinalReply(reply, messageContext);
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

        const reply = `工具决策无效，无法继续执行：${toolName}；原始回复：${JSON.stringify(decisionData)}`;
        _emitFinalReply(reply, messageContext);
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
      const reply = `当前无法自动决策下一步：${String(err)}；原始回复：${responseText.slice(0, 200)}`;
      _emitFinalReply(reply, messageContext);
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

export function createPlanNode(messageContext?: MessageContext) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const userMessage = getLastUserMessageText(state);
    const workspaceId = state.workspace_id;

    logger.info({ event: 'director.plan.entry', user_message: userMessage.slice(0, 100) });

    let plan: Array<Record<string, unknown>>;

    try {
      const { systemPrompt, messages } = buildDirectorPlanMessages(userMessage);
      const response = await llmService.chat(messages as any, systemPrompt);

      let responseText = stripCodeBlock(response);
      const data = JSON.parse(responseText);
      const rawTasks = data.tasks;
      if (!rawTasks || !Array.isArray(rawTasks)) {
        throw new Error('计划结果缺少 tasks');
      }

      plan = rawTasks.map((task: Record<string, unknown>, i: number) => ({
        id: i + 1,
        description: (task.description as string) || `步骤 ${i + 1}`,
        goal: (task.goal as string) || (task.description as string) || `完成步骤 ${i + 1}`,
        done_when: (task.done_when as string) || '该步骤目标达成',
        phase: (task.phase as string) || 'implementation',
        status: 'pending',
        tool: null,
        args: null,
        result: null,
        feedback: null,
      }));
    } catch (e) {
      logger.warn({ event: 'director.plan.fallback', error: String(e) });
      plan = [
        { id: 1, description: '理解需求并确认工作区现状', goal: '明确任务边界', done_when: '已确认目标文件和工作区状态', phase: 'research', status: 'pending', tool: null, args: null, result: null, feedback: null },
        { id: 2, description: '执行核心改动', goal: '完成用户请求的功能', done_when: '相关文件和行为已按要求完成', phase: 'implementation', status: 'pending', tool: null, args: null, result: null, feedback: null },
        { id: 3, description: '验证结果', goal: '确认结果满足要求', done_when: '测试或检查结果符合预期', phase: 'verification', status: 'pending', tool: null, args: null, result: null, feedback: null },
      ];
    }

    const planContent = planFileService.formatPlanAsMarkdown(userMessage, plan as any);
    const createResult = planFileService.createPlan(workspaceId, planContent, plan as any);
    const planFilePath = createResult.plan_file;

    logger.info({ event: 'director.plan.created', plan_file: planFilePath, steps: plan.length });

    if (messageContext?.send_message) {
      await messageContext.send_message('', SegmentType.STATE_CHANGE, {
        execution_mode: 'PLAN',
        plan_steps: plan.length,
        plan_file: planFilePath,
      });
    }

    const chatDescription = `计划已生成并保存到 plan.md。\n\n以下是计划内容：\n${planContent}\n\n请向用户简要总结这个计划，并询问用户是否同意执行。`;

    return {
      plan: plan as any,
      plan_file: planFilePath,
      plan_content: planContent,
      final_reply: undefined,
      has_tool_use: true,
      pending_tools: [{ tool: 'chat', args: { description: chatDescription } }],
      next_action: {
        kind: 'tool',
        tool_name: 'chat',
        tool_args: { description: chatDescription },
        task_description: '总结计划并询问用户',
      },
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
    const parentChainMessages = state.parent_chain_messages || [];
    const currentConversationMessages = state.current_conversation_messages || [];
    const workspaceId = state.workspace_id;
    const executionMode = state.execution_mode;

    if (pendingTools.length === 0) {
      return {
        pending_tools: [],
        in_plan_mode: false,
        execution_mode: undefined,
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

    let toolResult: { result: unknown; error: string | null };

    if (toolName === 'chat') {
      const chatResult = await _executeChatToolDirect(
        taskDescription || state.current_user_message_text || '',
        messageContext,
        (state.parent_chain_messages || []) as Array<Record<string, unknown>>,
        (state.current_conversation_messages || []) as Array<Record<string, unknown>>,
        toolArgs,
        toolArgs.multimodal_parts,
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

    const enhancedMessageContext: Record<string, unknown> = { ...(messageContext as unknown as Record<string, unknown> || {}) };
    enhancedMessageContext['parent_chain_messages'] = parentChainMessages;
    enhancedMessageContext['current_conversation_messages'] = currentConversationMessages;

    toolResult = await runToolExecution({
      toolName,
      toolArgs,
      workspaceId,
      agentType: currentAgentType,
      previousCalls: state.tool_history,
      taskDescription,
      previousResults: (state.tool_history || [])
        .filter((item: ToolCall) => item.result !== undefined)
        .map((item: ToolCall) => String(item.result || '')),
      messageContext: enhancedMessageContext,
    });

    const resultStr = toolResult.result ? String(toolResult.result) : '';
    const truncatedResult = resultStr.length > 4000 ? resultStr.slice(0, 4000) + '...' : resultStr;

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

export function createOrchestratorGraphV3(messageContext?: MessageContext) {
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
    done: END,
  });

  return graph.compile();
}

export const createOrchestratorGraph = createOrchestratorGraphV3;

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

  const graph = createOrchestratorGraphV3(messageContext);
  const finalState = await graph.invoke(initialState, { recursionLimit: 50 });

  logger.info({
    event: 'director_graph.completed',
    workspace_id: workspaceId,
    has_final_reply: !!finalState.final_reply,
  });

  return finalState as AgentState;
}
