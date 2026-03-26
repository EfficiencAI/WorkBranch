import type { ConversationDetail, MessageNode, SessionDetail, SessionId, SessionSummary, WorkspaceDetail } from '../../../entities'
import type { ChatStreamEvent } from '../../../shared/api'

export type ChatWorkbenchState = {
  sessions: SessionSummary[]
  selectedSessionId: SessionId | null
  sessionDetail: SessionDetail | null
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
  selectSession: (sessionId: SessionId) => Promise<void>
  sendMessage: (messageText: string, handlers?: SendMessageHandlers) => Promise<void>

  clearError: () => void
  resetConversationState: () => void
  resetAll: () => void
}

export type ChatWorkbenchStore = ChatWorkbenchState & ChatWorkbenchActions
