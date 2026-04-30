export type ConversationId = string

export interface ConversationPosition {
  x: number
  y: number
}

export interface ConversationNode {
  conversationId: ConversationId
  parentConversationId: ConversationId | null
  title: string | null
  state: string
  messageCount: number
  position: ConversationPosition | null
  createdAt?: string
  updatedAt?: string
}

export interface ConversationDetail {
  conversationId: ConversationId
  sessionId: number
  workspaceId: string | null
  parentConversationId: string | null
  title: string | null
  state: string
  messageCount: number
  position: ConversationPosition | null
  createdAt: string
  updatedAt?: string
  endedAt?: string | null
  error?: string | null
}
