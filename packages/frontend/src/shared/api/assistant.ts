import type { Assistant, AssistantFaq, KnowledgeSource, ShareInfo } from '../../entities'
import { AUTH_TOKEN_KEY, getApiUrl } from './config'
import { ApiError } from './error'
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

export function reindexSource(assistantId: number, sourceId: number) {
  return post<KnowledgeSource, undefined>(`/api/assistants/${assistantId}/sources/${sourceId}/reindex`)
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

export interface VisitorStreamHandlers {
  onDelta?: (content: string) => void
  onDone?: (content: string, sources: string[]) => void
  onError?: (message: string) => void
}

async function readSseStream(response: Response, handlers: VisitorStreamHandlers): Promise<void> {
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    throw new ApiError(`请求失败：${response.status}`, { status: response.status, details: text })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sepIndex: number
    while ((sepIndex = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, sepIndex)
      buffer = buffer.slice(sepIndex + 2)
      const line = raw.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      try {
        const event = JSON.parse(line.slice(6)) as { type: string; content?: string; sources?: string[] }
        if (event.type === 'text_delta' && event.content) {
          handlers.onDelta?.(event.content)
        } else if (event.type === 'done') {
          handlers.onDone?.(event.content ?? '', event.sources ?? [])
        } else if (event.type === 'error') {
          handlers.onError?.(event.content ?? '服务异常')
        }
      } catch {
        // 忽略无法解析的事件行
      }
    }
  }
}

/** POST 消息并从 text/event-stream 响应中解析 data: 事件（EventSource 不支持 POST） */
export async function streamVisitorAnswer(
  token: string,
  conversationId: number,
  message: string,
  handlers: VisitorStreamHandlers,
): Promise<void> {
  const url = getApiUrl(`/api/share/${token}/conversations/${conversationId}/messages`)
  const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ message }),
  })
  await readSseStream(response, handlers)
}

export async function streamTrainAnswer(
  assistantId: number,
  message: string,
  handlers: VisitorStreamHandlers,
): Promise<void> {
  const url = getApiUrl(`/api/assistants/${assistantId}/train/messages`)
  const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ message }),
  })
  await readSseStream(response, handlers)
}

export function fetchFaqs(assistantId: number) {
  return get<AssistantFaq[]>(`/api/assistants/${assistantId}/faqs`)
}

export function createFaq(assistantId: number, input: { question: string; answer: string; kind?: 'faq' | 'knowledge' }) {
  return post<AssistantFaq, typeof input>(`/api/assistants/${assistantId}/faqs`, input)
}

export function updateFaq(assistantId: number, faqId: number, input: { question: string; answer: string }) {
  return put<AssistantFaq, typeof input>(`/api/assistants/${assistantId}/faqs/${faqId}`, input)
}

export function deleteFaq(assistantId: number, faqId: number) {
  return del<null>(`/api/assistants/${assistantId}/faqs/${faqId}`)
}
