export type MessageNodeId = string

export type MessageNodeStatus = 'streaming' | 'completed' | 'error'

export interface MessageNode {
  id: MessageNodeId
  conversationId: string
  userContent: string
  assistantContent: string
  status: MessageNodeStatus
  createdAt?: string
  updatedAt?: string
}

export type ConversationState = 'idle' | 'generating' | 'done' | 'error'
