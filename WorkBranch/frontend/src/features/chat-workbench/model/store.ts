import { create } from 'zustand'
import type { ConversationDetail, ConversationNode, SessionDetail, SessionId, WorkspaceDetail } from '../../../entities'
import {
  fetchConversationDetail,
  fetchConversationMessages,
  fetchSessionConversations,
  fetchWorkspaceDetail,
  getErrorMessage,
  streamConversationMessage,
} from '../../../shared/api'
import { frontendLogger } from '../../../shared/logging/logger'
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
  conversationMessages: [],
  loading: false,
  messagesLoading: false,
  streaming: false,
  error: null,
  messagesError: null,

  clearError() {
    set({ error: null })
  },

  resetConversationState() {
    set({ conversationDetail: null, workspaceDetail: null, conversationNodes: [], conversationMessages: [] })
  },

  resetAll() {
    set({
      conversationDetail: null,
      workspaceDetail: null,
      conversationNodes: [],
      conversationMessages: [],
      loading: false,
      messagesLoading: false,
      streaming: false,
      error: null,
      messagesError: null,
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

  async loadConversationMessages(conversationId: string) {
    try {
      set({ messagesLoading: true, messagesError: null })
      const conversationMessages = await fetchConversationMessages(conversationId)
      set({ conversationMessages })
    } catch (caughtError) {
      set({ messagesError: getErrorMessage(caughtError, '对话消息加载失败') })
      throw caughtError
    } finally {
      set({ messagesLoading: false })
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
        const conversationMessages = await fetchConversationMessages(primaryConversationId)
        set({ conversationDetail: bundle.detail, workspaceDetail: bundle.workspace, conversationMessages })
      } else {
        set({ conversationDetail: null, workspaceDetail: null, conversationMessages: [] })
      }

      return 'ready'
    } catch (caughtError) {
      console.error('[enterSessionContext] error:', caughtError)
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

  async sendMessageToConversation(conversationId: string, messageText: string, handlers: SendMessageHandlers = {}) {
    const { currentSessionId } = useSessionStore.getState()

    if (!currentSessionId) {
      return
    }

    const { onEvent, onStreamError, signal } = handlers

    try {
      set({ streaming: true })
      frontendLogger.info('send_message', {
        extra: {
          conversation_id: conversationId,
          message_length: messageText.length,
        },
      })

      await streamConversationMessage(
        conversationId,
        {
          message: messageText,
        },
        {
          signal,
          onEvent(event: ChatStreamEvent) {
            onEvent?.(event)
            if (event.type === 'error') {
              frontendLogger.error('stream_failed', {
                extra: {
                  conversation_id: conversationId,
                  reason: typeof event.content === 'string' ? event.content : 'stream_error_event',
                },
              })
              onStreamError?.(event)
            }
          },
        },
      )

      await Promise.all([
        get().loadConversationBundle(conversationId),
        get().loadConversationMessages(conversationId),
      ])

      const currentSessionDetail = await useSessionStore.getState().loadSessionDetail(currentSessionId)
      const summaries = currentSessionDetail ? currentSessionDetail.conversations ?? (await fetchSessionConversations(currentSessionId)) : []
      const conversationNodes: ConversationNode[] = summaries.map((item) => ({ ...item }))
      set({ conversationNodes })
    } catch (caughtError) {
      frontendLogger.error('stream_failed', {
        extra: {
          conversation_id: conversationId,
          reason: getErrorMessage(caughtError, 'stream_request_failed'),
        },
      })
      throw caughtError
    } finally {
      set({ streaming: false })
    }
  },
}))
