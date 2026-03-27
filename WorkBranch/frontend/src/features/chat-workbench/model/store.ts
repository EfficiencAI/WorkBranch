import { create } from 'zustand'
import type { SessionId } from '../../../entities'
import {
  fetchConversationDetail,
  fetchConversationNodes,
  fetchWorkspaceDetail,
  getErrorMessage,
  streamSessionMessage,
} from '../../../shared/api'
import type { ChatStreamEvent } from '../../../shared/api'
import { useSessionStore } from '../../session'
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
      conversationDetail: null,
      workspaceDetail: null,
      nodes: [],
      loading: false,
      streaming: false,
      error: null,
    })
  },

  async loadConversationBundle(conversationId: string) {
    try {
      set({ loading: true, error: null })
      const bundle = await loadConversationBundle(conversationId)
      set({
        conversationDetail: bundle.detail,
        workspaceDetail: bundle.nextWorkspace,
        nodes: bundle.nextNodes,
      })
    } catch (caughtError) {
      set({ error: getErrorMessage(caughtError, '对话数据加载失败') })
    } finally {
      set({ loading: false })
    }
  },

  async loadChatWorkbench(preferredSessionId?: SessionId | null) {
    try {
      set({ loading: true, error: null })

      await useSessionStore.getState().loadSessions(preferredSessionId)
      const { activeConversationId } = useSessionStore.getState()

      if (!activeConversationId) {
        set({ conversationDetail: null, workspaceDetail: null, nodes: [] })
        return
      }

      const bundle = await loadConversationBundle(activeConversationId)
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

  async sendMessage(messageText: string, handlers: SendMessageHandlers = {}) {
    const { currentSessionId } = useSessionStore.getState()
    const { conversationDetail } = get()

    if (!currentSessionId || !conversationDetail) {
      return
    }

    const { onEvent, onStreamError, signal } = handlers

    try {
      set({ streaming: true })

      await streamSessionMessage(
        currentSessionId,
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

      await get().loadChatWorkbench(currentSessionId)
    } finally {
      set({ streaming: false })
    }
  },
}))
