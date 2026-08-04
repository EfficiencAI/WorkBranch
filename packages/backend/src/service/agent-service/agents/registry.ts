import type { AgentDefinition } from './definitions';
import { BUILTIN_AGENTS } from './definitions';

class AgentRegistryImpl {
  private agents: Map<string, AgentDefinition> = new Map();

  constructor() {
    this.registerBuiltinAgents();
  }

  private registerBuiltinAgents(): void {
    for (const [, agentDef] of Object.entries(BUILTIN_AGENTS)) {
      this.register(agentDef);
    }
  }

  register(agentDef: AgentDefinition): void {
    this.agents.set(agentDef.agent_type, agentDef);
  }

  get(agentType: string): AgentDefinition | undefined {
    return this.agents.get(agentType);
  }

  getAll(): Record<string, AgentDefinition> {
    const result: Record<string, AgentDefinition> = {};
    for (const [key, value] of this.agents) {
      result[key] = value;
    }
    return result;
  }

  getAgentInfo(agentType: string): Record<string, unknown> {
    const agent = this.get(agentType);
    if (!agent) return {};

    return {
      agent_type: agent.agent_type,
      description: agent.description,
      when_to_use: agent.when_to_use,
      capabilities: agent.capabilities,
      allowed_tools: agent.allowed_tools,
      disallowed_tools: agent.disallowed_tools,
      model: agent.model,
    };
  }
}

export const agentRegistry = new AgentRegistryImpl();
