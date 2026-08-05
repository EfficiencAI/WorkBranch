export type AssistantStatus = 'draft' | 'published' | 'disabled';

export interface Assistant {
  id: number;
  owner_id: number;
  name: string;
  avatar: string | null;
  description: string | null;
  welcome_message: string | null;
  system_rules: string | null;
  model: string | null;
  base_url: string | null;
  temperature: number | null;
  max_tokens: number | null;
  quick_questions: string | null;
  status: AssistantStatus | string;
  created_at: string;
  updated_at: string;
}

export type KnowledgeSourceType = 'file' | 'text' | 'code';
export type KnowledgeSourceStatus = 'pending' | 'processing' | 'indexed' | 'failed';

export interface KnowledgeSource {
  id: number;
  assistant_id: number;
  type: KnowledgeSourceType | string;
  title: string;
  file_path: string | null;
  size: number | null;
  status: KnowledgeSourceStatus | string;
  error: string | null;
  version: number;
  chunk_count: number;
  created_at: string;
}

export type ShareMode = 'public' | 'password';

export interface ShareInfo {
  id: number;
  assistant_id: number;
  token: string;
  mode: ShareMode | string;
  password_hash: string | null;
  expires_at: string | null;
  enabled: number;
  created_at: string;
}

export interface AssistantFaq {
  id: number;
  assistant_id: number;
  question: string;
  answer: string;
  kind: 'faq' | 'knowledge' | string;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: number;
  name: string | null;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
}
