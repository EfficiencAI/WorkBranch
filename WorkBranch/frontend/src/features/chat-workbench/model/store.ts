import { create } from 'zustand'
import type { ConversationDetail, ConversationNode, SessionDetail, SessionId, WorkspaceDetail } from '../../../entities'
import {
  cancelConversation,
  deleteConversation,
  fetchConversationDetail,
  fetchConversationMessages,
  fetchSessionConversations,
  fetchWorkspaceDetail,
  getErrorMessage,
  streamConversationMessage,
  updateConversationPositions,
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
  if (workspace) {
    frontendLogger.info('workspace.loaded', {
      extra: {
        workspace_id: workspace.id,
        conversation_id: conversationId,
        session_id: detail.sessionId,
      },
    })
  }
  return { detail, workspace }
}

function pickPrimaryConversationId(_sessionDetail: SessionDetail, conversationNodes: ConversationNode[]) {
  return conversationNodes[conversationNodes.length - 1]?.conversationId ?? null
}

function updateConversationNodesWithPositions(
  conversationNodes: ConversationNode[],
  positions: Map<string, ConversationNode['position']>,
) {
  return conversationNodes.map((conversation) => {
    const nextPosition = positions.get(conversation.conversationId)
    if (!nextPosition) {
      return conversation
    }

    return {
      ...conversation,
      position: nextPosition,
    }
  })
}

function isAbortError(caughtError: unknown) {
  return caughtError instanceof DOMException && caughtError.name === 'AbortError'
}

let activeStreamAbortController: AbortController | null = null

export const useChatWorkbenchStore = create<ChatWorkbenchStore>((set, get) => ({
  conversationDetail: null,
  workspaceDetail: null,
  conversationNodes: [],
  conversationMessages: [],
  loading: false,
  messagesLoading: false,
  streaming: false,
  streamingConversationId: null,
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
      streamingConversationId: null,
      error: null,
      messagesError: null,
    })
  },

  async loadConversationBundle(conversationId: string) {
    try {
      set({ error: null })
      const bundle = await loadConversationDetailBundle(conversationId)
      set({
        conversationDetail: bundle.detail,
        workspaceDetail: bundle.workspace,
      })
    } catch (caughtError) {
      set({ error: getErrorMessage(caughtError, '对话数据加载失败') })
      throw caughtError
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

  async syncConversationContext(conversationId: string | null) {
    if (!conversationId) {
      set({ conversationDetail: null, workspaceDetail: null, conversationMessages: [], messagesError: null })
      return
    }

    await Promise.all([get().loadConversationBundle(conversationId), get().loadConversationMessages(conversationId)])
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
      set({ error: null })

      const conversationNodes: ConversationNode[] = summaries.map((item) => ({ ...item }))
      const primaryConversationId = pickPrimaryConversationId(sessionDetail, conversationNodes)

      set({ conversationNodes })

      if (primaryConversationId) {
        await get().syncConversationContext(primaryConversationId)
      } else {
        set({ conversationDetail: null, workspaceDetail: null, conversationMessages: [] })
      }

      return 'ready'
    } catch (caughtError) {
      console.error('[enterSessionContext] error:', caughtError)
      get().resetConversationState()
      set({ error: getErrorMessage(caughtError, '会话对话树加载失败') })
      return 'empty-session'
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

  async deleteConversationFromSession(conversationId: string) {
    const { currentSessionId } = useSessionStore.getState()

    if (!currentSessionId) {
      return
    }

    try {
      set({ error: null })
      await deleteConversation(conversationId)

      const currentSessionDetail = await useSessionStore.getState().loadSessionDetail(currentSessionId)
      const summaries = currentSessionDetail ? currentSessionDetail.conversations ?? (await fetchSessionConversations(currentSessionId)) : []
      const conversationNodes: ConversationNode[] = summaries.map((item) => ({ ...item }))

      set({ conversationNodes })
    } catch (caughtError) {
      set({ error: getErrorMessage(caughtError, '删除对话节点失败') })
      throw caughtError
    }
  },

  updateConversationNodePosition(conversationId, position) {
    const positions = new Map([[conversationId, position]])
    set((state) => ({
      conversationNodes: updateConversationNodesWithPositions(state.conversationNodes, positions),
      conversationDetail:
        state.conversationDetail?.conversationId === conversationId
          ? { ...state.conversationDetail, position }
          : state.conversationDetail,
    }))
  },

  updateConversationNodePositions(positions) {
    const positionMap = new Map(positions.map((item) => [item.conversationId, item.position]))
    set((state) => ({
      conversationNodes: updateConversationNodesWithPositions(state.conversationNodes, positionMap),
      conversationDetail:
        state.conversationDetail && positionMap.has(state.conversationDetail.conversationId)
          ? {
              ...state.conversationDetail,
              position: positionMap.get(state.conversationDetail.conversationId) ?? state.conversationDetail.position,
            }
          : state.conversationDetail,
    }))
  },

  async persistConversationPositions(sessionId, positions) {
    if (!positions.length) {
      return
    }

    try {
      await updateConversationPositions(
        sessionId,
        positions.map((item) => ({
          conversationId: item.conversationId,
          x: item.position.x,
          y: item.position.y,
        })),
      )
    } catch (caughtError) {
      set({ error: getErrorMessage(caughtError, '保存节点位置失败') })
      throw caughtError
    }
  },

  async sendMessageToConversation(conversationId: string, messageText: string, handlers: SendMessageHandlers = {}) {
    const { currentSessionId } = useSessionStore.getState()

    if (!currentSessionId) {
      return
    }

    const { onEvent, onStreamError } = handlers
    const abortController = new AbortController()
    activeStreamAbortController = abortController

    try {
      set({ streaming: true, streamingConversationId: conversationId })
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
          signal: abortController.signal,
          onEvent(event: ChatStreamEvent) {
            onEvent?.(event)
            
            if (event.type === 'text' && event.content) {
              set(state => {
                const lastMessage = state.conversationMessages[state.conversationMessages.length - 1]
                
                if (lastMessage?.role === 'assistant' && lastMessage.status === 'streaming') {
                  const updatedMessages = [...state.conversationMessages]
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    content: lastMessage.content + event.content
                  }
                  return { conversationMessages: updatedMessages }
                }
                
                return {
                  conversationMessages: [...state.conversationMessages, {
                    id: `stream-${conversationId}-${Date.now()}`,
                    parentId: lastMessage?.id ?? null,
                    role: 'assistant' as const,
                    content: event.content ?? '',
                    createdAt: event.timestamp ?? new Date().toISOString(),
                    status: 'streaming' as const,
                  }]
                }
              })
            }
            
            if (event.type === 'done') {
              frontendLogger.info('stream_completed', {
                extra: {
                  conversation_id: conversationId,
                  latency_ms: event.metadata?.latency_ms,
                },
              })
              
              set(state => {
                const lastMessage = state.conversationMessages[state.conversationMessages.length - 1]
                if (lastMessage?.role === 'assistant' && lastMessage.status === 'streaming') {
                  const updatedMessages = [...state.conversationMessages]
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    status: 'completed'
                  }
                  return { conversationMessages: updatedMessages }
                }
                return state
              })
            }
            
            if (event.type === 'error') {
              frontendLogger.error('stream_failed', {
                extra: {
                  conversation_id: conversationId,
                  reason: typeof event.content === 'string' ? event.content : 'stream_error_event',
                },
              })
              
              set(state => {
                const lastMessage = state.conversationMessages[state.conversationMessages.length - 1]
                if (lastMessage?.role === 'assistant' && lastMessage.status === 'streaming') {
                  const updatedMessages = [...state.conversationMessages]
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    status: 'error'
                  }
                  return { conversationMessages: updatedMessages }
                }
                return state
              })
              
              onStreamError?.(event)
            }
          },
        },
      )

      await Promise.all([get().loadConversationBundle(conversationId), get().loadConversationMessages(conversationId)])

      const currentSessionDetail = await useSessionStore.getState().loadSessionDetail(currentSessionId)
      const summaries = currentSessionDetail ? currentSessionDetail.conversations ?? (await fetchSessionConversations(currentSessionId)) : []
      const conversationNodes: ConversationNode[] = summaries.map((item) => ({ ...item }))
      set({ conversationNodes })
    } catch (caughtError) {
      if (!isAbortError(caughtError)) {
        frontendLogger.error('stream_failed', {
          extra: {
            conversation_id: conversationId,
            reason: getErrorMessage(caughtError, 'stream_request_failed'),
          },
        })
        throw caughtError
      }
    } finally {
      if (activeStreamAbortController === abortController) {
        activeStreamAbortController = null
      }
      set({ streaming: false, streamingConversationId: null })
    }
  },

  async cancelStreamingConversation() {
    const { streamingConversationId } = get()

    if (!streamingConversationId) {
      return
    }

    activeStreamAbortController?.abort()

    try {
      await cancelConversation(streamingConversationId)
    } finally {
      await Promise.all([get().loadConversationBundle(streamingConversationId), get().loadConversationMessages(streamingConversationId)])

      const { currentSessionId } = useSessionStore.getState()
      if (currentSessionId) {
        const currentSessionDetail = await useSessionStore.getState().loadSessionDetail(currentSessionId)
        const summaries = currentSessionDetail ? currentSessionDetail.conversations ?? (await fetchSessionConversations(currentSessionId)) : []
        const conversationNodes: ConversationNode[] = summaries.map((item) => ({ ...item }))
        set({ conversationNodes })
      }
    }
  },
}))
