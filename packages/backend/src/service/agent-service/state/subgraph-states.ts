export interface CompactionState {
  messages: unknown[];
  max_messages: number;
  compressed: boolean;
  summary: string;
}

export interface ToolExecutionState {
  tool_name: string;
  tool_args: Record<string, unknown>;
  workspace_id: string;
  permission: string;
  result: string;
  error: string;
  doom_loop_detected: boolean;
  previous_calls: Array<Record<string, unknown>>;
  task_description: string;
  previous_results: string[];
  agent_type: string;
  auto_approve: boolean;
  execution_mode: string;
  mode_reason: string;
}
