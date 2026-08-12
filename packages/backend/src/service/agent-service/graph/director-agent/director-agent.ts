import { StateGraph, END, START } from '@langchain/langgraph';
import type { AgentState, NextAction, IntentAnalysis } from '../../state/agent-state';
import { ExecutionMode } from '../decision/complexity-analyzer';
import { llmService } from '../../service/llm-service';
import { planFileService } from '../../service/plan-file-service';
import { SegmentType } from '../../../session-service/canonical';
import { logger } from '../../../../core/logging';
import { buildDirectorPlanMessages } from '../../prompts/graph-prompts';
import { AgentStateChannels } from '../v4/channels';
import { buildV4Graph } from '../v4/graph';

export interface MessageContext {
  send_message?: (content: string, type: SegmentType, metadata?: Record<string, unknown>) => Promise<void>;
  session_id?: string;
  conversation_id?: string;
  workspace_id?: string;
  message_id?: string;
  cancel_check?: () => void;
  settings_service?: Record<string, unknown>;
}

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

    const loadedPlan = _loadPlanContentForState(state);
    if (loadedPlan.planContent) {
      result.plan_content = loadedPlan.planContent;
      result.plan_file = loadedPlan.planFile;
    }

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

export function createOrchestratorGraphV4(messageContext?: MessageContext) {
  const graph = new StateGraph({
    channels: AgentStateChannels,
  } as any);

  graph.addNode('analyze', createAnalyzeNode(messageContext));
  graph.addNode('loop', buildV4Graph({
    llmService,
    messageContext: messageContext as unknown as Record<string, unknown>,
  }));

  (graph as any).addEdge(START, 'analyze');
  (graph as any).addEdge('analyze', 'loop');
  (graph as any).addEdge('loop', END);

  return graph.compile();
}

export const createOrchestratorGraphV3 = createOrchestratorGraphV4;
export const createOrchestratorGraph = createOrchestratorGraphV4;

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

  const graph = createOrchestratorGraphV3(messageContext);
  const finalState = await graph.invoke(initialState, { recursionLimit: 200 });

  logger.info({
    event: 'director_graph.completed',
    workspace_id: workspaceId,
    has_final_reply: !!finalState.final_reply,
  });

  return finalState as AgentState;
}
