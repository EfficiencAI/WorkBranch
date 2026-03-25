export type MessageNodeId = string

export type MessageNodeRole = 'system' | 'user' | 'assistant' | 'tool'

export interface MessageNode {
  id: MessageNodeId
  parentId?: MessageNodeId | null
  role: MessageNodeRole
  content: string
  createdAt?: string
  status?: string
}

export type ConversationState = 'idle' | 'generating' | 'done' | 'error'
