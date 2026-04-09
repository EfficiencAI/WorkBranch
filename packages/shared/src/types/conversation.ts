export interface Conversation {
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  workspaceId: string;
}

export interface CreateConversationRequest {
  title?: string;
  workspaceId: string;
}

export interface UpdateConversationRequest {
  title?: string;
}
