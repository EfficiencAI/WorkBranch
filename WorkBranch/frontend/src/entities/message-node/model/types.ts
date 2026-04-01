export type MessageNodeId = string

export type MessageNodeRole = 'system' | 'user' | 'assistant' | 'tool'

export type MessageNodeStatus = 'streaming' | 'completed' | 'error'

export interface MessageNode {
  id: MessageNodeId
  parentId?: MessageNodeId | null
  role: MessageNodeRole
  content: string
  createdAt?: string
  status?: MessageNodeStatus
}

export type ConversationState = 'idle' | 'generating' | 'done' | 'error'
