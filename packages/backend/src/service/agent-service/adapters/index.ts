import { BuiltinAgentAdapter } from './builtin-agent-adapter';
import { TraeCliAgentAdapter } from './trae-cli-agent-adapter';
import { settingsService } from '../../settings-service';
import type { AgentAdapter, AgentId } from './types';

const adapters = new Map<AgentId, AgentAdapter>();

for (const adapter of [new BuiltinAgentAdapter(), new TraeCliAgentAdapter()]) {
  adapters.set(adapter.id, adapter);
}

export function resolveAgentAdapter(agentId?: string): AgentAdapter {
  const configuredAgent = agentId ?? settingsService.get('agent:default_agent');
  if (configuredAgent !== 'builtin' && configuredAgent !== 'trae') {
    throw new Error(`Unsupported agent: ${String(configuredAgent)}`);
  }

  const adapter = adapters.get(configuredAgent);
  if (!adapter) {
    throw new Error(`Agent adapter not registered: ${configuredAgent}`);
  }
  return adapter;
}

export type { AgentAdapter, AgentAdapterContext, AgentId } from './types';
