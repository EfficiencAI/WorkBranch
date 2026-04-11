import { BaseSubAgent, type AgentContext, type SubAgentResult, type TokenCallback } from './base';
import { ExploreAgent } from './explore-agent';
import { ReviewAgent } from './review-agent';

export { BaseSubAgent, ExploreAgent, ReviewAgent };
export type { AgentContext, SubAgentResult, TokenCallback };

const SUBAGENT_REGISTRY: Record<string, new (tokenCallback: TokenCallback) => BaseSubAgent> = {
  explore_agent: ExploreAgent,
  review_agent: ReviewAgent,
};

export function getSubagent(name: string, tokenCallback: TokenCallback): BaseSubAgent {
  const AgentClass = SUBAGENT_REGISTRY[name];
  if (!AgentClass) {
    throw new Error(`Unknown SubAgent: ${name}`);
  }
  return new AgentClass(tokenCallback);
}

export function listSubagents(): string[] {
  return Object.keys(SUBAGENT_REGISTRY);
}

export function hasSubagent(name: string): boolean {
  return name in SUBAGENT_REGISTRY;
}
