export enum AgentCapability {
  READ = 'read',
  WRITE = 'write',
  EXECUTE = 'execute',
  EXPLORE = 'explore',
  PLAN = 'plan',
  REVIEW = 'review',
}

export interface AgentDefinition {
  agent_type: string;
  description: string;
  when_to_use: string;
  capabilities: AgentCapability[];
  allowed_tools: string[];
  disallowed_tools: string[];
  model: string;
  system_prompt_generator?: () => string;
  permission_mode?: string;
  omit_claude_md: boolean;
  background: boolean;
}

export const BUILTIN_AGENTS: Record<string, AgentDefinition> = {
  'general-purpose': {
    agent_type: 'general-purpose',
    description: '通用 Agent，可执行任何任务',
    when_to_use: '复杂任务、多步骤操作、需要读写文件的任务',
    capabilities: [AgentCapability.READ, AgentCapability.WRITE, AgentCapability.EXECUTE],
    allowed_tools: ['*'],
    disallowed_tools: [],
    model: 'inherit',
    omit_claude_md: false,
    background: false,
  },
  explore: {
    agent_type: 'explore',
    description: '代码探索 Agent，只读模式',
    when_to_use: '快速搜索代码、查找文件、理解项目结构',
    capabilities: [AgentCapability.READ, AgentCapability.EXPLORE],
    allowed_tools: ['read_file', 'list_dir', 'explore_code', 'explore_internet'],
    disallowed_tools: ['write_file', 'delete_file', 'create_dir'],
    model: 'gpt-3.5-turbo',
    omit_claude_md: false,
    background: false,
  },
  plan: {
    agent_type: 'plan',
    description: '规划 Agent，用于设计实现方案',
    when_to_use: '需要设计实现策略、架构决策、复杂任务分解',
    capabilities: [AgentCapability.READ, AgentCapability.PLAN],
    allowed_tools: ['read_file', 'list_dir', 'explore_code', 'thinking'],
    disallowed_tools: ['write_file', 'delete_file'],
    model: 'inherit',
    omit_claude_md: false,
    background: false,
  },
  review: {
    agent_type: 'review',
    description: '代码审查 Agent',
    when_to_use: '代码审查、问题检测、优化建议',
    capabilities: [AgentCapability.READ, AgentCapability.REVIEW],
    allowed_tools: ['read_file', 'list_dir', 'explore_code'],
    disallowed_tools: ['write_file', 'delete_file'],
    model: 'inherit',
    omit_claude_md: false,
    background: false,
  },
};
