import type { ConversationDetail, ConversationNode, MessageNode, SessionDetail, SessionId, WorkspaceDetail } from '../../../entities'
import type { ChatStreamEvent } from '../../../shared/api'

export type SessionContextResult = 'empty-session' | 'ready'

export type ChatWorkbenchState = {
  conversationDetail: ConversationDetail | null
  workspaceDetail: WorkspaceDetail | null
  conversationNodes: ConversationNode[]
  conversationMessages: MessageNode[]

  loading: boolean
  messagesLoading: boolean
  streaming: boolean
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
  enterSessionContext: (sessionDetail: SessionDetail | null) => Promise<SessionContextResult>
  sendMessageToConversation: (conversationId: string, messageText: string, handlers?: SendMessageHandlers) => Promise<void>

  clearError: () => void
  resetConversationState: () => void
  resetAll: () => void
}

export type ChatWorkbenchStore = ChatWorkbenchState & ChatWorkbenchActions
