export interface ToolExecutionContext {
  workspace_id: string;
  conversation_id: string;
  message_id: string;
  agent_type?: string;
}

export interface ToolResult {
  result: unknown;
  error: string | null;
}

export interface ToolDefinition {
  name: string;
  description: string;
  params: string;
  category: string;
  executor: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolResult>;
}
