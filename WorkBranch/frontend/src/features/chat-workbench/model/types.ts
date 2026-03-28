import type { ConversationDetail, MessageNode, SessionDetail, SessionId, WorkspaceDetail } from '../../../entities'
import type { ChatStreamEvent } from '../../../shared/api'

export type SessionContextResult = 'empty-session' | 'ready'

export type ChatWorkbenchState = {
  conversationDetail: ConversationDetail | null
  workspaceDetail: WorkspaceDetail | null
  nodes: MessageNode[]

  loading: boolean
  streaming: boolean
  error: string | null
}

export type SendMessageHandlers = {
  onEvent?: (event: ChatStreamEvent) => void
  onStreamError?: (event: ChatStreamEvent) => void
  signal?: AbortSignal
}

export type ChatWorkbenchActions = {
  loadChatWorkbench: (preferredSessionId?: SessionId | null) => Promise<void>
  loadConversationBundle: (conversationId: string) => Promise<void>
  enterSessionContext: (sessionDetail: SessionDetail | null) => Promise<SessionContextResult>
  sendMessage: (messageText: string, handlers?: SendMessageHandlers) => Promise<void>

  clearError: () => void
  resetConversationState: () => void
  resetAll: () => void
}

export type ChatWorkbenchStore = ChatWorkbenchState & ChatWorkbenchActions
