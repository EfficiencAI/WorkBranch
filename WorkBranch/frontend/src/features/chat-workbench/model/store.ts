import { create } from 'zustand'
import type { ConversationDetail, MessageNode, SessionDetail, SessionId, WorkspaceDetail } from '../../../entities'
import {
  fetchConversationDetail,
  fetchConversationNodes,
  fetchSessionConversations,
  fetchWorkspaceDetail,
  getErrorMessage,
  streamSessionMessage,
} from '../../../shared/api'
import type { ChatStreamEvent } from '../../../shared/api'
import { isApiError } from '../../../shared/api'
import { useSessionStore } from '../../session'
import type { ChatWorkbenchStore, SendMessageHandlers, SessionContextResult } from './types'

type AggregatedConversation = {
  detail: ConversationDetail
  workspace: WorkspaceDetail | null
  nodes: MessageNode[]
}

async function loadConversation(conversationId: string): Promise<AggregatedConversation> {
  const detail = await fetchConversationDetail(conversationId)

  const workspacePromise = detail.workspaceId
    ? fetchWorkspaceDetail(detail.workspaceId).catch((caughtError) => {
        if (isApiError(caughtError) && caughtError.status === 404) {
          return null
        }

        throw caughtError
      })
    : Promise.resolve(null)

  const [nodes, workspace] = await Promise.all([fetchConversationNodes(conversationId), workspacePromise])

  return { detail, workspace, nodes }
}

function pickPrimaryConversation(conversations: AggregatedConversation[]): AggregatedConversation | null {
  return conversations[conversations.length - 1] ?? null
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
      const conversation = await loadConversation(conversationId)
      set({
        conversationDetail: conversation.detail,
        workspaceDetail: conversation.workspace,
        nodes: conversation.nodes,
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

    const conversationRefs = sessionDetail.conversationRefs ?? await fetchSessionConversations(sessionDetail.id)
    if (!conversationRefs.length) {
      get().resetConversationState()
      return 'empty-session'
    }

    try {
      set({ loading: true, error: null })

      const conversations = await Promise.all(conversationRefs.map((ref) => loadConversation(ref.conversationId)))

      const mergedNodes = conversations.flatMap((item) => item.nodes)
      const primaryConversation = pickPrimaryConversation(conversations)

      set({
        conversationDetail: primaryConversation?.detail ?? null,
        workspaceDetail: primaryConversation?.workspace ?? null,
        nodes: mergedNodes,
      })

      return mergedNodes.length || primaryConversation ? 'ready' : 'empty-session'
    } catch (caughtError) {
      get().resetConversationState()
      set({ error: getErrorMessage(caughtError, '会话节点树加载失败') })
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
