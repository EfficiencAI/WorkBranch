import { create } from 'zustand'
import type { ConversationDetail, ConversationNode, SessionDetail, SessionId, WorkspaceDetail } from '../../../entities'
import {
  fetchConversationDetail,
  fetchSessionConversations,
  fetchWorkspaceDetail,
  getErrorMessage,
  streamSessionMessage,
} from '../../../shared/api'
import type { ChatStreamEvent } from '../../../shared/api'
import { isApiError } from '../../../shared/api'
import { useSessionStore } from '../../session'
import type { ChatWorkbenchStore, SendMessageHandlers, SessionContextResult } from './types'

async function loadConversationDetailBundle(conversationId: string): Promise<{
  detail: ConversationDetail
  workspace: WorkspaceDetail | null
}> {
  const detail = await fetchConversationDetail(conversationId)

  const workspacePromise = detail.workspaceId
    ? fetchWorkspaceDetail(detail.workspaceId).catch((caughtError) => {
        if (isApiError(caughtError) && caughtError.status === 404) {
          return null
        }

        throw caughtError
      })
    : Promise.resolve(null)

  const workspace = await workspacePromise
  return { detail, workspace }
}

function pickPrimaryConversationId(sessionDetail: SessionDetail, conversationNodes: ConversationNode[]) {
  if (sessionDetail.activeConversationId) {
    const hit = conversationNodes.find((node) => node.conversationId === sessionDetail.activeConversationId)
    if (hit) {
      return hit.conversationId
    }
  }

  return conversationNodes[conversationNodes.length - 1]?.conversationId ?? null
}

export const useChatWorkbenchStore = create<ChatWorkbenchStore>((set, get) => ({
  conversationDetail: null,
  workspaceDetail: null,
  conversationNodes: [],
  loading: false,
  streaming: false,
  error: null,

  clearError() {
    set({ error: null })
  },

  resetConversationState() {
    set({ conversationDetail: null, workspaceDetail: null, conversationNodes: [] })
  },

  resetAll() {
    set({
      conversationDetail: null,
      workspaceDetail: null,
      conversationNodes: [],
      loading: false,
      streaming: false,
      error: null,
    })
  },

  async loadConversationBundle(conversationId: string) {
    try {
      set({ loading: true, error: null })
      const bundle = await loadConversationDetailBundle(conversationId)
      set({
        conversationDetail: bundle.detail,
        workspaceDetail: bundle.workspace,
      })
    } catch (caughtError) {
      set({ error: getErrorMessage(caughtError, '对话数据加载失败') })
      throw caughtError
    } finally {
      set({ loading: false })
    }
  },

  async enterSessionContext(sessionDetail: SessionDetail | null): Promise<SessionContextResult> {
    if (!sessionDetail) {
      get().resetConversationState()
      return 'empty-session'
    }

    const summaries = sessionDetail.conversations ?? (await fetchSessionConversations(sessionDetail.id))
    if (!summaries.length) {
      get().resetConversationState()
      return 'empty-session'
    }

    try {
      set({ loading: true, error: null })

      const conversationNodes: ConversationNode[] = summaries.map((item) => ({ ...item }))
      const primaryConversationId = pickPrimaryConversationId(sessionDetail, conversationNodes)

      set({ conversationNodes })

      if (primaryConversationId) {
        const bundle = await loadConversationDetailBundle(primaryConversationId)
        set({ conversationDetail: bundle.detail, workspaceDetail: bundle.workspace })
      } else {
        set({ conversationDetail: null, workspaceDetail: null })
      }

      return 'ready'
    } catch (caughtError) {
      get().resetConversationState()
      set({ error: getErrorMessage(caughtError, '会话对话树加载失败') })
      return 'empty-session'
    } finally {
      set({ loading: false })
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
