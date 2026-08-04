import type { ToolDefinition, ToolResult, ToolExecutionContext } from './types';

export type { ToolDefinition, ToolResult, ToolExecutionContext };

export const TOOL_CATEGORIES = {
  FILE: 'file',
  EXPLORE: 'explore',
  SUBAGENT: 'subagent',
  AGENT: 'agent',
  WORKSPACE: 'workspace',
  TODO: 'todo',
  MODE: 'mode',
  PLAN: 'plan',
  SPECIAL: 'special',
} as const;

export type ToolCategory = typeof TOOL_CATEGORIES[keyof typeof TOOL_CATEGORIES];

const AGENT_DEFAULT_TOOLS: Record<string, string[]> = {
  director_agent: [
    'read_file', 'write_file', 'delete_file', 'list_dir', 'create_dir', 'read_document',
    'explore_code', 'explore_internet',
    'thinking', 'chat',
    'call_explore_agent', 'call_review_agent',
    'spawn_agent', 'send_message_to_agent', 'stop_agent', 'list_agents',
    'list_workspace_files', 'get_workspace_info', 'search_files',
    'update_todo', 'switch_execution_mode',
    'enter_plan_mode', 'exit_plan_mode', 'update_plan', 'execute_plan',
  ],
  plan_agent: [
    'read_file', 'write_file', 'list_dir', 'read_document',
    'explore_code',
    'thinking', 'chat',
    'call_explore_agent', 'call_review_agent',
    'switch_execution_mode',
    'enter_plan_mode', 'exit_plan_mode', 'update_plan', 'execute_plan',
  ],
  review_agent: [
    'read_file', 'list_dir', 'explore_code',
    'thinking', 'chat',
  ],
  explore_agent: [
    'read_file', 'list_dir', 'read_document',
    'explore_code', 'explore_internet',
    'thinking', 'chat',
    'list_workspace_files', 'get_workspace_info', 'search_files',
  ],
  admin_agent: [
    'read_file', 'write_file', 'delete_file', 'list_dir', 'create_dir', 'read_document',
    'explore_code', 'explore_internet',
    'thinking', 'chat',
    'call_explore_agent', 'call_review_agent',
    'spawn_agent', 'send_message_to_agent', 'stop_agent', 'list_agents',
    'list_workspace_files', 'get_workspace_info', 'search_files',
    'update_todo', 'switch_execution_mode',
    'enter_plan_mode', 'exit_plan_mode', 'update_plan', 'execute_plan',
  ],
};

const DANGEROUS_TOOL_NAMES = new Set([
  'delete_file',
  'execute_command',
  'modify_system',
]);

class ToolRegistryImpl {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listByCategory(category: string): ToolDefinition[] {
    return this.list().filter((t) => t.category === category);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAllowedToolsForAgent(agentType: string): string[] {
    return AGENT_DEFAULT_TOOLS[agentType] || AGENT_DEFAULT_TOOLS['director_agent'];
  }

  listByAgentType(agentType: string): ToolDefinition[] {
    const allowed = this.getAllowedToolsForAgent(agentType);
    return allowed
      .map(name => this.tools.get(name))
      .filter((t): t is ToolDefinition => t !== undefined);
  }

  isToolAllowedForAgent(toolName: string, agentType: string): boolean {
    const allowed = this.getAllowedToolsForAgent(agentType);
    return allowed.includes(toolName);
  }

  isDangerous(toolName: string): boolean {
    return DANGEROUS_TOOL_NAMES.has(toolName);
  }

  checkToolPermission(
    toolName: string,
    agentType: string,
    autoApprove: boolean = false,
  ): { allowed: boolean; reason?: string } {
    if (!this.has(toolName)) {
      return { allowed: false, reason: `工具 ${toolName} 不存在` };
    }

    if (!this.isToolAllowedForAgent(toolName, agentType)) {
      return { allowed: false, reason: `Agent 类型 ${agentType} 不允许使用工具 ${toolName}` };
    }

    if (this.isDangerous(toolName) && !autoApprove) {
      return { allowed: true, reason: '需要用户确认' };
    }

    return { allowed: true };
  }

  generateToolPrompt(allowedTools?: string[]): string {
    const toolList = allowedTools
      ? allowedTools.map(name => this.tools.get(name)).filter((t): t is ToolDefinition => t !== undefined)
      : this.list();

    if (toolList.length === 0) {
      return '当前没有可用工具。';
    }

    const lines = ['## 工具列表'];
    for (const tool of toolList) {
      if (tool.params) {
        lines.push(tool.params);
      }
    }

    return lines.join('\n');
  }

  generateToolPromptForAgent(agentType: string): string {
    return this.generateToolPrompt(this.getAllowedToolsForAgent(agentType));
  }

  getToolCategories(): Record<string, ToolDefinition[]> {
    const categories: Record<string, ToolDefinition[]> = {};
    for (const tool of this.list()) {
      const cat = tool.category || 'other';
      if (!categories[cat]) {
        categories[cat] = [];
      }
      categories[cat].push(tool);
    }
    return categories;
  }
}

export const toolRegistry = new ToolRegistryImpl();
