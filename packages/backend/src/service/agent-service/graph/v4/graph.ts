import { StateGraph, END, START } from '@langchain/langgraph';
import type { AgentState, ToolRecord } from '../../state/agent-state';
import { AgentStateChannels } from './channels';
import { createReasoningNode, routeAfterReasoning } from './reasoning';
import { createActingNode, routeAfterActing } from './acting';
import { createClosuringNode, routeAfterClosuring } from './closuring';
import { createFinalizeNode } from './finalize';

export interface V4GraphOptions {
  llmService?: unknown;
  settingsService?: unknown;
  messageContext?: Record<string, unknown>;
  postExecuteHook?: (
    update: Partial<AgentState>,
    results: ToolRecord[],
    state: AgentState,
  ) => Partial<AgentState> | void;
  enableTodo?: boolean;
  closuringEnabled?: boolean;
}

const REASONING_ROUTES = {
  acting: 'leader_acting',
  closuring: 'sidekick_closuring',
  reasoning: 'leader_reasoning',
  finalize: 'finalize',
};

const ACTING_ROUTES = {
  reasoning: 'leader_reasoning',
  finalize: 'finalize',
};

const CLOSURING_ROUTES = {
  finalize: 'finalize',
  reasoning: 'leader_reasoning',
};

export function buildV4Graph(options: V4GraphOptions = {}) {
  const graph = new StateGraph({
    channels: AgentStateChannels,
  } as never);

  graph.addNode('leader_reasoning', createReasoningNode({
    llmService: options.llmService,
    settingsService: options.settingsService,
    messageContext: options.messageContext,
    closuringEnabled: options.closuringEnabled,
  }));
  graph.addNode('leader_acting', createActingNode({
    llmService: options.llmService,
    settingsService: options.settingsService,
    messageContext: options.messageContext,
    postExecuteHook: options.postExecuteHook,
  }));
  graph.addNode('sidekick_closuring', createClosuringNode({
    llmService: options.llmService,
    settingsService: options.settingsService,
    messageContext: options.messageContext,
    enabled: options.closuringEnabled,
  }));
  graph.addNode('finalize', createFinalizeNode({ messageContext: options.messageContext }));

  (graph as never as { addEdge: (from: string, to: string) => void }).addEdge(START, 'leader_reasoning');
  (graph as never as {
    addConditionalEdges: (node: string, route: (state: AgentState) => string, mapping: Record<string, string>) => void;
  }).addConditionalEdges('leader_reasoning', routeAfterReasoning, REASONING_ROUTES);
  (graph as never as {
    addConditionalEdges: (node: string, route: (state: AgentState) => string, mapping: Record<string, string>) => void;
  }).addConditionalEdges('leader_acting', routeAfterActing, ACTING_ROUTES);
  (graph as never as {
    addConditionalEdges: (node: string, route: (state: AgentState) => string, mapping: Record<string, string>) => void;
  }).addConditionalEdges('sidekick_closuring', routeAfterClosuring, CLOSURING_ROUTES);
  (graph as never as { addEdge: (from: string, to: string) => void }).addEdge('finalize', END);

  return graph.compile();
}

export function buildV4ChildLoop(options: Omit<V4GraphOptions, 'closuringEnabled' | 'postExecuteHook'> = {}) {
  const graph = new StateGraph({
    channels: AgentStateChannels,
  } as never);

  graph.addNode('leader_reasoning', createReasoningNode({
    llmService: options.llmService,
    settingsService: options.settingsService,
    messageContext: options.messageContext,
    closuringEnabled: false,
  }));
  graph.addNode('leader_acting', createActingNode({
    llmService: options.llmService,
    settingsService: options.settingsService,
    messageContext: options.messageContext,
  }));
  graph.addNode('finalize', createFinalizeNode({ messageContext: options.messageContext }));

  const childReasoningRoutes = {
    acting: 'leader_acting',
    reasoning: 'leader_reasoning',
    finalize: 'finalize',
  };
  (graph as never as { addEdge: (from: string, to: string) => void }).addEdge(START, 'leader_reasoning');
  (graph as never as {
    addConditionalEdges: (node: string, route: (state: AgentState) => string, mapping: Record<string, string>) => void;
  }).addConditionalEdges('leader_reasoning', routeAfterReasoning, childReasoningRoutes);
  (graph as never as {
    addConditionalEdges: (node: string, route: (state: AgentState) => string, mapping: Record<string, string>) => void;
  }).addConditionalEdges('leader_acting', routeAfterActing, ACTING_ROUTES);
  (graph as never as { addEdge: (from: string, to: string) => void }).addEdge('finalize', END);

  return graph.compile();
}
