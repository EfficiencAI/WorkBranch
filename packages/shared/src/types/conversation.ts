export interface Conversation {
  id: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  workspaceId: string;
}

export interface UpdateConversationRequest {
  title?: string;
}

export interface ConversationDetail {
  conversation_id: string;
  session_id: number;
  workspace_id: string;
  parent_conversation_id: string | null;
  title: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  message_count: number;
  error: string | null;
  position_x: number | null;
  position_y: number | null;
}

export interface ConversationSummary {
  conversation_id: string;
  parent_conversation_id: string | null;
  title: string | null;
  state: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  position_x: number | null;
  position_y: number | null;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  session_id: number;
  user_content: string;
  assistant_content: string | null;
  thinking_content: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ContextInfo {
  conversation_id: string;
  message_count: number;
  total_chars: number;
  estimated_tokens: number;
}
