export type SessionId = string | number

export interface SessionSummary {
  id: SessionId
  title: string
  status?: string
  updatedAt?: string
  createdAt?: string
  hasActiveConversation?: boolean
  activeConversationId?: string | null
}

export interface SessionDetail extends SessionSummary {
  userId?: number
  conversationRefs?: SessionConversationRef[]
}

export interface SessionConversationRef {
  conversationId: string
}
