import type { SegmentType } from '../../session-service/canonical';
import type { AgentOutcome } from '../graph/agent-graphs';

export type AgentId = 'builtin' | 'trae';

export type AgentMessageRecord = Record<string, unknown>;

export interface AgentAdapterContext {
  userMessage: string;
  workspaceId: string;
  workspaceDir: string;
  conversationId: string;
  sessionId: string;
  messageId: string;
  parentChainMessages: AgentMessageRecord[];
  currentConversationMessages: AgentMessageRecord[];
  signal: AbortSignal;
  cancelCheck: () => void;
  publish: (content?: string, blockType?: SegmentType, metadata?: Record<string, unknown>) => Promise<void>;
}

export interface AgentAdapter {
  id: AgentId;
  run(context: AgentAdapterContext): Promise<AgentOutcome>;
}
