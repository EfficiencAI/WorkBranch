export type ConversationId = string

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
