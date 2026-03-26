import { create } from 'zustand'
import type { SessionId } from '../../../entities'
import {
  fetchConversationDetail,
  fetchConversationNodes,
  fetchSessionDetail,
  fetchSessions,
  fetchWorkspaceDetail,
  getErrorMessage,
  streamSessionMessage,
} from '../../../shared/api'
import type { ChatStreamEvent } from '../../../shared/api'
import type { ChatWorkbenchStore, SendMessageHandlers } from './types'

async function loadConversationBundle(conversationId: string) {
  const detail = await fetchConversationDetail(conversationId)
  const [nextNodes, nextWorkspace] = await Promise.all([
    fetchConversationNodes(conversationId),
    detail.workspaceId ? fetchWorkspaceDetail(detail.workspaceId) : Promise.resolve(null),
  ])

  return { detail, nextNodes, nextWorkspace }
}

export const useChatWorkbenchStore = create<ChatWorkbenchStore>((set, get) => ({
  sessions: [],
  selectedSessionId: null,
  sessionDetail: null,
  conversationDetail: null,
  workspaceDetail: null,
  nodes: [],
  loading: false,
  streaming: false,
  error: null,

  clearError() {
    set({ error: null })
  },

  resetConversationState() {
    set({ conversationDetail: null, workspaceDetail: null, nodes: [] })
  },

  resetAll() {
    set({
      sessions: [],
      selectedSessionId: null,
      sessionDetail: null,
      conversationDetail: null,
      workspaceDetail: null,
      nodes: [],
      loading: false,
      streaming: false,
      error: null,
    })
  },

  async loadChatWorkbench(preferredSessionId?: SessionId | null) {
    try {
      set({ loading: true, error: null })

      const nextSessions = await fetchSessions()
      const nextSessionId = preferredSessionId ?? nextSessions[0]?.id ?? null

      set({ sessions: nextSessions, selectedSessionId: nextSessionId })

      if (nextSessionId === null || nextSessionId === undefined) {
        set({ sessionDetail: null, conversationDetail: null, workspaceDetail: null, nodes: [] })
        return
      }

      const detail = await fetchSessionDetail(nextSessionId)
      set({ sessionDetail: detail })

      if (!detail.activeConversationId) {
        set({ conversationDetail: null, workspaceDetail: null, nodes: [] })
        return
      }

      const bundle = await loadConversationBundle(detail.activeConversationId)
      set({
        conversationDetail: bundle.detail,
        workspaceDetail: bundle.nextWorkspace,
        nodes: bundle.nextNodes,
      })
    } catch (caughtError) {
      set({ error: getErrorMessage(caughtError, '工作台数据加载失败') })
    } finally {
      set({ loading: false })
    }
  },

  async selectSession(sessionId: SessionId) {
    await get().loadChatWorkbench(sessionId)
  },

  async sendMessage(messageText: string, handlers: SendMessageHandlers = {}) {
    const { selectedSessionId, conversationDetail } = get()

    if (!selectedSessionId || !conversationDetail) {
      return
    }

    const { onEvent, onStreamError, signal } = handlers

    try {
      set({ streaming: true })

      await streamSessionMessage(
        selectedSessionId,
        {
          message: messageText,
          workspace_id: conversationDetail.workspaceId,
        },
        {
          signal,
          onEvent(event: ChatStreamEvent) {
            onEvent?.(event)
            if (event.type === 'error') {
              onStreamError?.(event)
            }
          },
        },
      )

      await get().loadChatWorkbench(selectedSessionId)
    } finally {
      set({ streaming: false })
    }
  },
}))
