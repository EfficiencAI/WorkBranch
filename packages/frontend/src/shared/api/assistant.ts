import type { Assistant, KnowledgeSource, ShareInfo } from '../../entities'
import { del, get, post, put } from './http'

export function fetchAssistants() {
  return get<Assistant[]>('/api/assistants')
}

export function fetchAssistant(assistantId: number) {
  return get<Assistant>(`/api/assistants/${assistantId}`)
}

export function createAssistant(input: { name: string; description?: string; avatar?: string; welcome_message?: string }) {
  return post<Assistant, typeof input>('/api/assistants', input)
}

export function updateAssistant(
  assistantId: number,
  input: Partial<{ name: string; description: string; avatar: string; welcome_message: string; system_rules: string; status: string }>,
) {
  return put<Assistant, typeof input>(`/api/assistants/${assistantId}`, input)
}

export function deleteAssistant(assistantId: number) {
  return del<null>(`/api/assistants/${assistantId}`)
}

export function fetchSources(assistantId: number) {
  return get<KnowledgeSource[]>(`/api/assistants/${assistantId}/sources`)
}

export function uploadSource(assistantId: number, file: File) {
  const form = new FormData()
  form.append('file', file)
  return post<KnowledgeSource, FormData>(`/api/assistants/${assistantId}/sources`, form)
}

export function deleteSource(assistantId: number, sourceId: number) {
  return del<null>(`/api/assistants/${assistantId}/sources/${sourceId}`)
}

export function fetchShares(assistantId: number) {
  return get<ShareInfo[]>(`/api/assistants/${assistantId}/shares`)
}

export function createShare(assistantId: number, input: { mode?: 'public' | 'password'; password?: string; expires_at?: string }) {
  return post<ShareInfo, typeof input>(`/api/assistants/${assistantId}/shares`, input)
}

export function setShareEnabled(assistantId: number, shareId: number, enabled: boolean) {
  return put<ShareInfo, { enabled: boolean }>(`/api/assistants/${assistantId}/shares/${shareId}`, { enabled })
}

export interface ShareMeta {
  token: string
  assistant: {
    id: number
    name: string
    avatar: string | null
    description: string | null
    welcome_message: string | null
  }
}

export function fetchShareMeta(token: string) {
  return get<ShareMeta>(`/api/share/${token}`)
}

export function createVisitorConversation(token: string) {
  return post<{ session_id: number; assistant: string }>(`/api/share/${token}/conversations`)
}
