export interface User {
  id: string;
  username: string;
  createdAt: number;
}

export interface SessionHistory {
  id: string;
  userId: string;
  conversationId: string;
  lastAccessedAt: number;
}
