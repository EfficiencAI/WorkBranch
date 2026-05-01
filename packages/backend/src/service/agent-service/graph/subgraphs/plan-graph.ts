import { StateGraph, END } from '@langchain/langgraph';
import type { Task, IntentAnalysis } from '../../state/agent-state';
import type { AgentState } from '../../state/agent-state';
import { llmService } from '../../service/llm-service';
import { logger } from '../../../../core/logging';
import { INTENT_ANALYSIS_PROMPT, PLAN_SYSTEM_PROMPT_BASE } from '../../prompts/graph-prompts';

export interface PlanPhase {
  phase: 'understand' | 'design' | 'review' | 'finalize' | 'exit';
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
}

export interface PlanResult {
  success: boolean;
  plan: Task[];
  intent_analysis?: IntentAnalysis;
  error?: string;
}

export function parsePlanFromText(text: string): Task[] {
  let responseText = text.trim();

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

  try {
    const data = JSON.parse(responseText);
    const rawTasks = data.tasks || [];

    return rawTasks.map(
      (task: Record<string, unknown>, idx: number) => ({
        id: idx + 1,
        description: String(task.description || `步骤 ${idx + 1}`),
        goal: String(task.goal || task.description || ''),
        done_when: String(task.done_when || '该步骤目标达成'),
        phase: String(task.phase || 'implementation'),
        status: 'pending',
        tool: task.tool as string | undefined,
        args: task.args as Record<string, unknown> | undefined,
        result: undefined,
        feedback: undefined,
      })
    );
  } catch {
    logger.warn({
      event: 'plan.parse_failed',
      text_preview: text.slice(0, 100),
    });
    return [];
  }
}

async function phase1Understand(state: AgentState): Promise<Partial<AgentState>> {
  logger.info({ event: 'plan.phase1', phase: 'understand' });

  const userMessage = getLastUserMessageText(state);
  const intentPrompt = INTENT_ANALYSIS_PROMPT.replace('{tool_prompt}', '');

  let intentAnalysis: IntentAnalysis = {
    intent_type: 'develop',
    summary: userMessage.slice(0, 100),
    key_points: [],
    suggested_tools: [],
    complexity: 'medium',
    confidence: 0.8,
  };

  try {
    const intentResponse = await llmService.chat(
      [{ role: 'user', content: `请分析以下用户需求：\n\n${userMessage}` }],
      intentPrompt
    );

    let parsed = intentResponse.trim();
    if (parsed.startsWith('```json')) parsed = parsed.slice(7);
    if (parsed.startsWith('```')) parsed = parsed.slice(3);
    if (parsed.endsWith('```')) parsed = parsed.slice(0, -3);
    parsed = parsed.trim();

    const data = JSON.parse(parsed);
    Object.assign(intentAnalysis, {
      intent_type: data.intent_type || 'develop',
      summary: data.summary || intentAnalysis.summary,
      key_points: data.key_points || [],
      suggested_tools: data.suggested_tools || [],
      complexity: data.complexity || 'medium',
      confidence: data.confidence || 0.8,
    });
  } catch {
    logger.warn({ event: 'plan.intent_parse_failed' });
  }

  return { intent_analysis: intentAnalysis };
}

async function phase2Design(state: AgentState): Promise<Partial<AgentState>> {
  logger.info({ event: 'plan.phase2', phase: 'design' });

  const userMessage = getLastUserMessageText(state);
  const intentAnalysis = state.intent_analysis;
  const planSystemPrompt = PLAN_SYSTEM_PROMPT_BASE.replace('{tool_prompt}', '');

  let plan: Task[] = [];

  try {
    const planResponse = await llmService.chat(
      [{ role: 'user', content: `请为以下需求生成详细的执行计划：\n\n${userMessage}\n\n意图分析结果：${JSON.stringify(intentAnalysis, null, 2)}` }],
      planSystemPrompt
    );
    plan = parsePlanFromText(planResponse);
  } catch {
    logger.warn({ event: 'plan.design_failed' });
    plan = [
      { id: 1, description: `分析需求: ${userMessage.slice(0, 30)}...`, goal: '理解需求', done_when: '需求已理解', phase: 'research', status: 'pending', tool: undefined, args: undefined, result: undefined, feedback: undefined },
      { id: 2, description: '执行实现', goal: '实现功能', done_when: '功能已实现', phase: 'implementation', status: 'pending', tool: undefined, args: undefined, result: undefined, feedback: undefined },
    ];
  }

  return { plan };
}

function phase3Review(state: AgentState): Partial<AgentState> {
  logger.info({ event: 'plan.phase3', phase: 'review' });

  const plan = state.plan || [];
  logger.info({
    event: 'plan.review',
    task_count: plan.length,
  });

  for (const task of plan) {
    logger.info({
      event: 'plan.review.task',
      task_id: task.id,
      description: task.description,
    });
  }

  return {};
}

function phase4Finalize(state: AgentState): Partial<AgentState> {
  logger.info({ event: 'plan.phase4', phase: 'finalize' });

  const plan = state.plan || [];
  logger.info({
    event: 'plan.finalize',
    task_count: plan.length,
  });

  return {
    current_step: 0,
    plan_failed: false,
  };
}

function phase5Exit(state: AgentState): Partial<AgentState> {
  logger.info({ event: 'plan.phase5', phase: 'exit' });
  return {};
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

const PlanStateChannels = {
  messages: { value: (a: unknown[], b: unknown[]) => a.concat(b), default: () => [] },
  current_user_message_text: { value: (_a: unknown, b: unknown) => b, default: () => '' },
  current_user_message_parts: { value: (_a: unknown, b: unknown) => b, default: () => [] },
  workspace_id: { value: (_a: unknown, b: unknown) => b, default: () => '' },
  plan: { value: (_a: unknown, b: unknown) => b, default: () => [] },
  current_step: { value: (_a: unknown, b: unknown) => b, default: () => 0 },
  results: { value: (a: unknown[], b: unknown[]) => a.concat(b), default: () => [] },
  plan_failed: { value: (_a: unknown, b: unknown) => b, default: () => false },
  explore_result: { value: (_a: unknown, b: unknown) => b, default: () => null },
  tool_history: { value: (a: unknown[], b: unknown[]) => a.concat(b), default: () => [] },
  replan_count: { value: (_a: unknown, b: unknown) => b, default: () => 0 },
  agent_type: { value: (_a: unknown, b: unknown) => b, default: () => '' },
  is_root_graph: { value: (_a: unknown, b: unknown) => b, default: () => false },
  parent_chain_messages: { value: (_a: unknown, b: unknown) => b, default: () => [] },
  current_conversation_messages: { value: (_a: unknown, b: unknown) => b, default: () => [] },
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
  intent_analysis: { value: (_a: unknown, b: unknown) => b, default: () => undefined },
};

export function createPlanSubgraph() {
  const graph = new StateGraph({
    channels: PlanStateChannels,
  } as any);

  graph.addNode('phase1', phase1Understand as any);
  graph.addNode('phase2', phase2Design as any);
  graph.addNode('phase3', phase3Review as any);
  graph.addNode('phase4', phase4Finalize as any);
  graph.addNode('phase5', phase5Exit as any);

  (graph as any).setEntryPoint('phase1');

  graph.addEdge('phase1', 'phase2');
  graph.addEdge('phase2', 'phase3');
  graph.addEdge('phase3', 'phase4');
  graph.addEdge('phase4', 'phase5');
  graph.addEdge('phase5', END);

  return graph.compile();
}

export async function runPlanFlow(
  userMessage: string,
  workspaceId: string,
  sendMessage?: (content: string, type: string, metadata?: Record<string, unknown>) => void
): Promise<PlanResult> {
  const send = sendMessage || (() => {});

  try {
    send('', 'PLAN_START', { phase: 'understand' });

    const initialState: Partial<AgentState> = {
      messages: [{ role: 'user', content: userMessage }],
      current_user_message_text: userMessage,
      workspace_id: workspaceId,
      plan: [],
      current_step: 0,
      results: [],
      plan_failed: false,
      tool_history: [],
      replan_count: 0,
      agent_type: 'director_agent',
      is_root_graph: false,
      parent_chain_messages: [],
      current_conversation_messages: [],
      execution_mode: 'PLAN',
      pending_tools: [],
      has_tool_use: false,
      final_reply: '',
      iteration_count: 0,
      max_iterations: 32,
      todos: [],
      current_todo_index: 0,
      todo_max_iterations: 32,
      invalid_tool_retry_count: 0,
    };

    const graph = createPlanSubgraph();
    const finalState = await graph.invoke(initialState as Record<string, unknown>) as AgentState;

    send('', 'PLAN_END', {});

    logger.info({
      event: 'plan.flow_completed',
      workspace_id: workspaceId,
      plan_steps: finalState.plan?.length || 0,
    });

    return {
      success: true,
      plan: finalState.plan || [],
      intent_analysis: finalState.intent_analysis,
    };
  } catch (error) {
    const errorMessage = String(error);
    send(errorMessage, 'ERROR', { phase: 'plan' });

    logger.error({
      event: 'plan.flow_failed',
      workspace_id: workspaceId,
      error: errorMessage,
    });

    return {
      success: false,
      plan: [],
      error: errorMessage,
    };
  }
}

export function formatPlanAsMarkdown(userMessage: string, tasks: Task[]): string {
  const lines = [
    `# 执行计划`,
    '',
    `## 用户需求`,
    userMessage,
    '',
    `## 执行步骤`,
    '',
  ];

  for (const task of tasks) {
    lines.push(`### ${task.id}. ${task.description}`);
    if (task.goal) {
      lines.push(`**目标**: ${task.goal}`);
    }
    if (task.done_when) {
      lines.push(`**完成条件**: ${task.done_when}`);
    }
    lines.push(`**阶段**: ${task.phase}`);
    lines.push('');
  }

  return lines.join('\n');
}
