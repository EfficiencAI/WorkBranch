import { create } from 'zustand'
import type { SessionDetail, SessionId } from '../../../entities'
import {
  fetchConversationDetail,
  fetchConversationNodes,
  fetchWorkspaceDetail,
  getErrorMessage,
  streamSessionMessage,
} from '../../../shared/api'
import type { ChatStreamEvent } from '../../../shared/api'
import { useSessionStore } from '../../session'
import { isApiError } from '../../../shared/api'
import type { ChatWorkbenchStore, SendMessageHandlers, SessionContextResult } from './types'

async function loadConversationBundle(conversationId: string) {
  const detail = await fetchConversationDetail(conversationId)

  const workspacePromise = detail.workspaceId
    ? fetchWorkspaceDetail(detail.workspaceId).catch((caughtError) => {
        if (isApiError(caughtError) && caughtError.status === 404) {
          return null
        }

        throw caughtError
      })
    : Promise.resolve(null)

  const [nextNodes, nextWorkspace] = await Promise.all([fetchConversationNodes(conversationId), workspacePromise])

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
      throw caughtError
    } finally {
      set({ loading: false })
    }
  },

  async enterSessionContext(sessionDetail: SessionDetail | null): Promise<SessionContextResult> {
    if (!sessionDetail?.activeConversationId) {
      get().resetConversationState()
      return 'overview'
    }

    try {
      await get().loadConversationBundle(sessionDetail.activeConversationId)
      return 'focused'
    } catch (caughtError) {
      // loadConversationBundle already writes store.error; we only normalize invalid references.
      if (isApiError(caughtError) && caughtError.status === 404) {
        get().resetConversationState()
        return 'invalid-active-conversation'
      }

      get().resetConversationState()
      return 'overview'
    }
  },

  async loadChatWorkbench(preferredSessionId?: SessionId | null) {
    try {
      set({ loading: true, error: null })

      await useSessionStore.getState().loadSessions(preferredSessionId)
      const { currentSessionDetail } = useSessionStore.getState()
      await get().enterSessionContext(currentSessionDetail)
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
