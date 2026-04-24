export enum AgentType {
  DIRECTOR_AGENT = 'director_agent',
  PLAN_AGENT = 'plan_agent',
  REVIEW_AGENT = 'review_agent',
  EXPLORE_AGENT = 'explore_agent',
  ADMIN_AGENT = 'admin_agent',
}

export enum IntentType {
  DEVELOP = 'develop',
  EXPLORE = 'explore',
  REVIEW = 'review',
  QUESTION = 'question',
  DEBUG = 'debug',
  REFACTOR = 'refactor',
  OTHER = 'other',
}

export enum TaskPhase {
  RESEARCH = 'research',
  SYNTHESIS = 'synthesis',
  IMPLEMENTATION = 'implementation',
  VERIFICATION = 'verification',
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface Task {
  id: number;
  description: string;
  goal?: string;
  done_when?: string;
  phase: string;
  status: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  feedback?: string;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  result?: string;
}

export interface IntentAnalysis {
  intent_type: string;
  summary: string;
  key_points: string[];
  suggested_tools: string[];
  complexity: string;
  confidence: number;
}

export interface TodoItem {
  id: number;
  description: string;
  goal?: string;
  done_when?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  attempt_count?: number;
}

export type NextActionKind = 'tool' | 'reply' | 'step_done' | 'blocked' | 'enter_plan';

export interface NextAction {
  kind: NextActionKind;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  reply?: string;
  task_description?: string;
}

export interface AgentState {
  messages: unknown[];
  current_user_message_text?: string;
  current_user_message_parts?: unknown[];
  workspace_id: string;
  plan: Task[];
  current_step: number;
  results: unknown[];
  plan_failed: boolean;
  explore_result?: Record<string, unknown>;
  tool_history: ToolCall[];
  replan_count: number;
  agent_type?: string;
  is_root_graph?: boolean;
  intent_analysis?: IntentAnalysis;
  parent_chain_messages?: Record<string, unknown>[];
  current_conversation_messages?: Record<string, unknown>[];
  execution_mode?: 'DIRECT' | 'PLAN';
  mode_reason?: string;
  suggested_tools?: string[];
  suggested_subagent?: string;
  in_plan_mode?: boolean;
  active_subagent?: boolean;
  pending_tools?: ToolCall[];
  has_tool_use?: boolean;
  final_reply?: string;
  plan_file?: string;
  plan_content?: string;
  forced_execution_mode?: 'DIRECT' | 'PLAN';
  last_tool_result?: string;
  last_tool_name?: string;
  last_tool_success?: boolean;
  last_tool_error?: string;
  iteration_count?: number;
  max_iterations?: number;
  todos?: TodoItem[];
  current_todo_index?: number;
  current_todo_goal?: string;
  current_todo_done_when?: string;
  current_todo_iteration_count?: number;
  todo_max_iterations?: number;
  todo_status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'continue' | 'blocked' | 'step_done';
  next_action?: NextAction;
}

export const MAX_DIRECT_ITERATIONS = 32;

export function createInitialState(
  workspaceId: string,
  userMessage?: string,
  parentChainMessages?: Record<string, unknown>[],
  currentConversationMessages?: Record<string, unknown>[],
  agentType?: string,
  forcedExecutionMode?: 'DIRECT' | 'PLAN',
  planFile?: string,
  planContent?: string
): AgentState {
  const messages = userMessage ? [{ role: 'user', content: userMessage }] : [];
  
  return {
    messages,
    current_user_message_text: userMessage,
    current_user_message_parts: [],
    workspace_id: workspaceId,
    plan: [],
    current_step: 0,
    results: [],
    plan_failed: false,
    tool_history: [],
    replan_count: 0,
    agent_type: agentType,
    is_root_graph: true,
    intent_analysis: undefined,
    parent_chain_messages: parentChainMessages || [],
    current_conversation_messages: currentConversationMessages || [],
    execution_mode: undefined,
    mode_reason: undefined,
    suggested_tools: [],
    in_plan_mode: false,
    pending_tools: [],
    has_tool_use: false,
    final_reply: undefined,
    plan_file: planFile,
    plan_content: planContent,
    forced_execution_mode: forcedExecutionMode,
    last_tool_result: undefined,
    last_tool_name: undefined,
    last_tool_success: undefined,
    last_tool_error: undefined,
    iteration_count: 0,
    max_iterations: MAX_DIRECT_ITERATIONS,
    todos: [],
    current_todo_index: 0,
    current_todo_goal: undefined,
    current_todo_done_when: undefined,
    current_todo_iteration_count: 0,
    todo_max_iterations: MAX_DIRECT_ITERATIONS,
    todo_status: undefined,
    next_action: undefined,
  };
}
