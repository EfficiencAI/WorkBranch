import type { ConversationDetail, MessageNode, SessionConversationRef, SessionDetail, SessionSummary, WorkspaceDetail } from '../../entities'
import { get } from './http'
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

function toConversationRef(payload: Record<string, unknown>): SessionConversationRef {
  return {
    conversationId: String(payload.conversation_id ?? ''),
  }
}

function toConversationDetail(payload: Record<string, unknown>): ConversationDetail {
  return {
    conversationId: String(payload.conversation_id ?? ''),
    sessionId: Number(payload.session_id ?? 0),
    workspaceId: payload.workspace_id ? String(payload.workspace_id) : null,
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

export async function fetchSessions() {
  const data = await get<Array<Record<string, unknown>>>('/chat/sessions')
  return data.map(toSessionSummary)
}

export async function fetchSessionDetail(sessionId: string | number) {
  const data = await get<Record<string, unknown>>(`/chat/sessions/${sessionId}`)
  return toSessionDetail(data)
}

export async function fetchSessionConversations(sessionId: string | number) {
  const data = await get<Array<Record<string, unknown>>>(`/chat/sessions/${sessionId}/conversations`)
  return data.map(toConversationRef)
}

export async function fetchConversationDetail(conversationId: string) {
  const data = await get<Record<string, unknown>>(`/chat/conversations/${conversationId}`)
  return toConversationDetail(data)
}

export async function fetchConversationNodes(conversationId: string) {
  const data = await get<Array<Record<string, unknown>>>(`/chat/conversations/${conversationId}/nodes`)
  return data.map(toMessageNode)
}

export async function fetchWorkspaceDetail(workspaceId: string) {
  const data = await get<Record<string, unknown>>(`/workspaces/${workspaceId}`)
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
  const response = await fetch(`/chat/sessions/${sessionId}/messages`, {
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
