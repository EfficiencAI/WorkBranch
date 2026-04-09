import { get, post, put, del } from './http'
import type { ConversationDetail, ConversationNode, MessageNode, SessionConversationSummary, SessionDetail, SessionSummary, WorkspaceDetail } from '../../entities'

function toConversationPosition(payload: Record<string, unknown>): ConversationNode['position'] {
  const x = typeof payload.position_x === 'number' ? payload.position_x : undefined
  const y = typeof payload.position_y === 'number' ? payload.position_y : undefined
  if (x !== undefined && y !== undefined) {
    return { x, y }
  }
  return undefined
}

function toSessionSummary(payload: Record<string, unknown>): SessionSummary {
  return {
    id: Number(payload.id ?? 0),
    title: String(payload.title ?? ''),
    createdAt: payload.created_at ? String(payload.created_at) : undefined,
    updatedAt: payload.updated_at ? String(payload.updated_at) : undefined,
  }
}

function toSessionDetail(payload: Record<string, unknown>): SessionDetail {
  return {
    ...toSessionSummary(payload),
    userId: typeof payload.user_id === 'number' ? payload.user_id : undefined,
  }
}

function toConversationSummary(payload: Record<string, unknown>): SessionConversationSummary {
  return {
    conversationId: String(payload.conversation_id ?? ''),
    parentConversationId:
      payload.parent_conversation_id === null || payload.parent_conversation_id === undefined
        ? null
        : String(payload.parent_conversation_id),
    title: payload.title === null || payload.title === undefined ? null : String(payload.title),
    state: String(payload.state ?? 'pending'),
    messageCount: Number(payload.message_count ?? 0),
    position: toConversationPosition(payload),
    createdAt: payload.created_at ? String(payload.created_at) : undefined,
    updatedAt: payload.updated_at ? String(payload.updated_at) : undefined,
  }
}

function toConversationDetail(payload: Record<string, unknown>): ConversationDetail {
  return {
    conversationId: String(payload.conversation_id ?? ''),
    sessionId: Number(payload.session_id ?? 0),
    workspaceId: payload.workspace_id ? String(payload.workspace_id) : null,
    parentConversationId:
      payload.parent_conversation_id === null || payload.parent_conversation_id === undefined
        ? null
        : String(payload.parent_conversation_id),
    title: payload.title === null || payload.title === undefined ? null : String(payload.title),
    state: String(payload.state ?? 'idle'),
    messageCount: Number(payload.message_count ?? 0),
    position: toConversationPosition(payload),
    createdAt: String(payload.created_at ?? ''),
    updatedAt: payload.updated_at ? String(payload.updated_at) : undefined,
    endedAt: payload.ended_at ? String(payload.ended_at) : null,
    error: payload.error ? String(payload.error) : null,
  }
}

function toMessageNode(payload: Record<string, unknown>): MessageNode {
  return {
    id: String(payload.id ?? ''),
    conversationId: String(payload.conversation_id ?? ''),
    userContent: String(payload.user_content ?? ''),
    assistantContent: String(payload.assistant_content ?? ''),
    status: (payload.status as MessageNode['status']) ?? 'completed',
    createdAt: payload.created_at ? String(payload.created_at) : undefined,
    updatedAt: payload.updated_at ? String(payload.updated_at) : undefined,
  }
}

function toWorkspaceDetail(payload: Record<string, unknown>): WorkspaceDetail {
  return {
    id: String(payload.id ?? ''),
    sessionId: (payload.session_id as string | number | undefined) ?? '',
    status: payload.status ? String(payload.status) : null,
    createdAt: payload.created_at ? String(payload.created_at) : null,
    dir: payload.dir ? String(payload.dir) : null,
  }
}

export async function createSession(title = '新会话') {
  const data = await post<Record<string, unknown>>(`/api/session/sessions?title=${encodeURIComponent(title)}`)
  return toSessionDetail(data)
}

export async function fetchSessions() {
  const data = await get<Array<Record<string, unknown>>>('/api/session/sessions')
  return data.map(toSessionSummary)
}

export async function deleteSession(sessionId: string | number) {
  await del(`/api/session/sessions/${sessionId}`)
}

export async function deleteConversation(conversationId: string) {
  await del(`/api/session/conversations/${conversationId}`)
}

export async function cascadeDeleteConversation(conversationId: string) {
  await del(`/api/session/conversations/${conversationId}/cascade`)
}

export async function fetchSessionDetail(sessionId: string | number) {
  const data = await get<Record<string, unknown>>(`/api/session/sessions/${sessionId}`)
  return toSessionDetail(data)
}

export async function createConversation(
  sessionId: string | number,
  workspaceId?: string | null,
  parentConversationId?: string | null,
) {
  const data = await post<Record<string, unknown>, { workspace_id?: string | null; parent_conversation_id?: string | null }>(`/api/session/sessions/${sessionId}/conversations`, {
    workspace_id: workspaceId,
    parent_conversation_id: parentConversationId,
  })

  return {
    conversationId: String(data.conversation_id ?? ''),
    sessionId: Number(data.session_id ?? sessionId),
    parentConversationId:
      data.parent_conversation_id === null || data.parent_conversation_id === undefined
        ? null
        : String(data.parent_conversation_id),
  }
}

export async function fetchSessionConversations(sessionId: string | number) {
  const data = await get<Array<Record<string, unknown>>>(`/api/session/sessions/${sessionId}/conversations`)
  return data.map(toConversationSummary)
}

export async function fetchConversationDetail(conversationId: string) {
  const data = await get<Record<string, unknown>>(`/api/session/conversations/${conversationId}`)
  return toConversationDetail(data)
}

export async function fetchConversationMessages(conversationId: string) {
  const data = await get<Array<Record<string, unknown>>>(`/api/session/conversations/${conversationId}/messages`)
  return data.map(toMessageNode)
}

export async function updateConversationPositions(
  sessionId: string | number,
  positions: Array<{ conversationId: string; x: number; y: number }>,
) {
  return put<{ updated: number }, { positions: Array<{ conversation_id: string; x: number; y: number }> }>(
    `/api/session/sessions/${sessionId}/conversation-positions`,
    {
      positions: positions.map((item) => ({
        conversation_id: item.conversationId,
        x: item.x,
        y: item.y,
      })),
    },
  )
}

export async function fetchWorkspaceDetail(workspaceId: string) {
  const data = await get<Record<string, unknown>>(`/api/workspaces/${workspaceId}`)
  return toWorkspaceDetail(data)
}

export type SegmentType =
  | 'thinking_start' | 'thinking_delta' | 'thinking_end'
  | 'text_start' | 'text_delta' | 'text_end'
  | 'plan_start' | 'plan_delta' | 'plan_end'
  | 'state_change' | 'tool_call' | 'tool_res'
  | 'error' | 'done'

export type ContentBlock = {
  type: SegmentType
  content: string
  metadata?: Record<string, unknown>
}

export type CanonicalMessage = {
  role: string
  message_id: string
  conversation_id: string
  session_id: string
  workspace_id: string
  content_blocks: ContentBlock[]
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}

export type SimpleEvent = {
  type: 'done' | 'error' | 'message_created'
  message_id?: string
  conversation_id?: string
  user_content?: string
  content: string
}

export type ChatStreamEvent = CanonicalMessage | SimpleEvent

export async function cancelConversation(conversationId: string) {
  await post(`/api/session/conversations/${conversationId}/cancel`)
}

export async function streamConversationMessage(
  conversationId: string,
  body: { message: string; enable_context?: boolean },
  handlers: {
    onEvent?: (event: ChatStreamEvent) => void
    signal?: AbortSignal
  } = {},
) {
  const response = await fetch(`/api/session/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Id': getClientId(),
    },
    body: JSON.stringify(body),
    signal: handlers.signal,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data: ')) {
        continue
      }

      const jsonStr = trimmed.slice(6)
      if (!jsonStr) {
        continue
      }

      try {
        const event = JSON.parse(jsonStr) as ChatStreamEvent
        handlers.onEvent?.(event)
      } catch {
        console.warn('Failed to parse SSE event:', jsonStr)
      }
    }
  }
}

function getClientId(): string {
  if (typeof window !== 'undefined') {
    let clientId = localStorage.getItem('client_id')
    if (!clientId) {
      clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
      localStorage.setItem('client_id', clientId)
    }
    return clientId
  }
  return 'server'
}
