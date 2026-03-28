import type { ConversationDetail, MessageNode, SessionConversationSummary, SessionDetail, SessionSummary, WorkspaceDetail } from '../../entities'
import { del, get, patch, post } from './http'
import { ApiError } from './error'

function toSessionSummary(payload: Record<string, unknown>): SessionSummary {
  return {
    id: payload.id as string | number,
    title: String(payload.title ?? ''),
    createdAt: payload.created_at ? String(payload.created_at) : undefined,
    updatedAt: payload.updated_at ? String(payload.updated_at) : undefined,
    hasActiveConversation: Boolean(payload.has_active_conversation),
    activeConversationId: payload.active_conversation_id ? String(payload.active_conversation_id) : null,
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
    createdAt: String(payload.created_at ?? ''),
    updatedAt: payload.updated_at ? String(payload.updated_at) : undefined,
    endedAt: payload.ended_at ? String(payload.ended_at) : null,
    messageCount: Number(payload.message_count ?? 0),
    error: payload.error ? String(payload.error) : null,
  }
}

function toMessageNode(payload: Record<string, unknown>, index: number): MessageNode {
  const rawId = payload.id
  const rawConversationId = payload.conversation_id
  const rawBufferIndex = payload.buffer_index
  return {
    id: rawId === null || rawId === undefined
      ? `${String(rawConversationId ?? 'conversation')}-buffer-${String(rawBufferIndex ?? index)}`
      : String(rawId),
    parentId: payload.parent_id === null || payload.parent_id === undefined ? null : String(payload.parent_id),
    role: (payload.role as MessageNode['role']) ?? 'assistant',
    content: String(payload.content ?? ''),
    createdAt: payload.created_at ? String(payload.created_at) : undefined,
    status: undefined,
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
  const data = await post<Record<string, unknown>>(`/api/chat/sessions?title=${encodeURIComponent(title)}`)
  return toSessionDetail(data)
}

export async function fetchSessions() {
  const data = await get<Array<Record<string, unknown>>>('/api/chat/sessions')
  return data.map(toSessionSummary)
}

export async function deleteSession(sessionId: string | number) {
  await del(`/api/chat/sessions/${sessionId}`)
}

export async function fetchSessionDetail(sessionId: string | number) {
  const data = await get<Record<string, unknown>>(`/api/chat/sessions/${sessionId}`)
  return toSessionDetail(data)
}

export async function patchSessionActiveConversation(sessionId: string | number, activeConversationId: string | null) {
  const data = await patch<Record<string, unknown>>(`/api/chat/sessions/${sessionId}`, {
    active_conversation_id: activeConversationId,
  })
  return toSessionDetail(data)
}

export async function createConversation(
  sessionId: string | number,
  workspaceId?: string | null,
  parentConversationId?: string | null,
) {
  const data = await post<Record<string, unknown>, { workspace_id?: string | null; parent_conversation_id?: string | null }>(`/api/chat/sessions/${sessionId}/conversations`, {
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
  const data = await get<Array<Record<string, unknown>>>(`/api/chat/sessions/${sessionId}/conversations`)
  return data.map(toConversationSummary)
}

export async function fetchConversationDetail(conversationId: string) {
  const data = await get<Record<string, unknown>>(`/api/chat/conversations/${conversationId}`)
  return toConversationDetail(data)
}

export async function fetchConversationMessages(conversationId: string) {
  const data = await get<Array<Record<string, unknown>>>(`/api/chat/conversations/${conversationId}/messages`)
  return data.map(toMessageNode)
}

export async function fetchWorkspaceDetail(workspaceId: string) {
  const data = await get<Record<string, unknown>>(`/api/workspaces/${workspaceId}`)
  return toWorkspaceDetail(data)
}

export type ChatStreamEvent = {
  type?: string
  content?: string
  timestamp?: string
  metadata?: Record<string, unknown>
}

export async function streamSessionMessage(
  sessionId: string | number,
  body: { message: string; workspace_id?: string | null },
  handlers: {
    onEvent?: (event: ChatStreamEvent) => void
    signal?: AbortSignal
  } = {},
) {
  const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: handlers.signal,
  })

  if (!response.ok || !response.body) {
    throw new ApiError(`请求失败：${response.status}`, { status: response.status })
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      const line = chunk
        .split('\n')
        .map((item) => item.trim())
        .find((item) => item.startsWith('data:'))

      if (!line) {
        continue
      }

      const raw = line.slice(5).trim()
      if (!raw) {
        continue
      }

      try {
        handlers.onEvent?.(JSON.parse(raw) as ChatStreamEvent)
      } catch {
        handlers.onEvent?.({ type: 'message', content: raw })
      }
    }
  }
}
