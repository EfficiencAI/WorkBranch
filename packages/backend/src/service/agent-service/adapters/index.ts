import { BuiltinAgentAdapter } from './builtin-agent-adapter';
import { TraeCliAgentAdapter } from './trae-cli-agent-adapter';
import type { AgentAdapter, AgentId } from './types';

const adapters = new Map<AgentId, AgentAdapter>();

for (const adapter of [new BuiltinAgentAdapter(), new TraeCliAgentAdapter()]) {
  adapters.set(adapter.id, adapter);
}

export function resolveAgentAdapter(agentId?: string): AgentAdapter {
  if (agentId === 'trae') {
    return adapters.get('trae')!;
  }
  return adapters.get('builtin')!;
}

export type { AgentAdapter, AgentAdapterContext, AgentId } from './types';
