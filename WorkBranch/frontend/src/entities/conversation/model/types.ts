export type ConversationId = string

export interface ConversationNode {
  conversationId: ConversationId
  parentConversationId: ConversationId | null
  title: string | null
  state: string
  messageCount: number
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
  createdAt: string
  updatedAt?: string
  endedAt?: string | null
  messageCount: number
  error?: string | null
}
