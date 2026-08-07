export type AssistantStatus = 'draft' | 'published' | 'disabled'

export interface Assistant {
  id: number
  owner_id: number
  name: string
  avatar: string | null
  description: string | null
  welcome_message: string | null
  system_rules: string | null
  model: string | null
  base_url: string | null
  temperature: number | null
  max_tokens: number | null
  quick_questions: string | null
  status: AssistantStatus | string
  created_at: string
  updated_at: string
}

export interface KnowledgeSource {
  id: number
  assistant_id: number
  type: 'file' | 'text' | 'code' | string
  title: string
  file_path: string | null
  size: number | null
  status: 'pending' | 'processing' | 'indexed' | 'failed' | string
  error: string | null
  version: number
  chunk_count: number
  entries: Array<{ path: string; size: number }>
  created_at: string
}

export interface ShareInfo {
  id: number
  assistant_id: number
  token: string
  mode: 'public' | 'password' | string
  password_hash: string | null
  expires_at: string | null
  enabled: number
  created_at: string
}

export interface AssistantFaq {
  id: number
  assistant_id: number
  question: string
  answer: string
  kind: 'faq' | 'knowledge' | string
  created_at: string
  updated_at: string
}

export interface AuthUser {
  id: number
  name: string | null
}

export interface AuthSession {
  user: AuthUser
  token: string
}
