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
  workspaceId?: string | null
  conversations?: SessionConversationSummary[]
}

export interface SessionConversationSummary {
  conversationId: string
  parentConversationId: string | null
  title: string | null
  state: string
  messageCount: number
  userPromptPreview: string | null
  assistantConclusionPreview: string | null
  position: ConversationPosition | null
  createdAt?: string
  updatedAt?: string
}
