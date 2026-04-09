import type { ConversationDetail, ConversationNode, ConversationPosition, MessageNode, SessionDetail, SessionId, WorkspaceDetail } from '../../../entities'
import type { ChatStreamEvent } from '../../../shared/api'

export type SessionContextResult = 'empty-session' | 'ready'

export type ChatWorkbenchState = {
  conversationDetail: ConversationDetail | null
  workspaceDetail: WorkspaceDetail | null
  conversationNodes: ConversationNode[]
  conversationMessages: MessageNode[]
  conversationMessagesCache: Record<string, MessageNode[]> // 新增：消息缓存

  loading: boolean
  messagesLoading: boolean
  streaming: boolean
  streamingConversationIds: Set<string>
  error: string | null
  messagesError: string | null
}

export type SendMessageHandlers = {
  onEvent?: (event: ChatStreamEvent) => void
  onStreamError?: (event: ChatStreamEvent) => void
  signal?: AbortSignal
}

export type ChatWorkbenchActions = {
  loadChatWorkbench: (preferredSessionId?: SessionId | null) => Promise<void>
  loadConversationBundle: (conversationId: string) => Promise<void>
  loadConversationMessages: (conversationId: string) => Promise<void>
  syncConversationContext: (conversationId: string | null) => Promise<void>
  enterSessionContext: (sessionDetail: SessionDetail | null) => Promise<SessionContextResult>
  deleteConversationFromSession: (conversationId: string) => Promise<void>
  cascadeDeleteConversationFromSession: (conversationId: string) => Promise<void>
  sendMessageToConversation: (conversationId: string, messageText: string, enableContext: boolean, handlers?: SendMessageHandlers) => Promise<void>
  cancelStreamingConversation: () => Promise<void>
  updateConversationNodePosition: (conversationId: string, position: ConversationPosition) => void
  updateConversationNodePositions: (positions: Array<{ conversationId: string; position: ConversationPosition }>) => void
  persistConversationPositions: (sessionId: SessionId, positions: Array<{ conversationId: string; position: ConversationPosition }>) => Promise<void>

  clearError: () => void
  resetConversationState: () => void
  resetAll: () => void
}

export type ChatWorkbenchStore = ChatWorkbenchState & ChatWorkbenchActions
