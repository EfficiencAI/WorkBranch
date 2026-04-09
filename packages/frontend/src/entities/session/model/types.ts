import type { ConversationPosition } from '../../conversation'

export type SessionId = string | number

export interface SessionSummary {
  id: SessionId
  title: string
  status?: string
  updatedAt?: string
  createdAt?: string
}

export interface SessionDetail extends SessionSummary {
  userId?: number
  conversations?: SessionConversationSummary[]
}

export interface SessionConversationSummary {
  conversationId: string
  parentConversationId: string | null
  title: string | null
  state: string
  messageCount: number
  position: ConversationPosition | null
  createdAt?: string
  updatedAt?: string
}
