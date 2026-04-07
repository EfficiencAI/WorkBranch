import { create } from 'zustand'
import { message } from 'antd'
import type { ConversationDetail, ConversationNode, SessionDetail, SessionId, WorkspaceDetail } from '../../../entities'
import {
  cancelConversation,
  cascadeDeleteConversation,
  deleteConversation,
  fetchConversationDetail,
  fetchConversationMessages,
  fetchSessionConversations,
  fetchWorkspaceDetail,
  get as httpGet,
  getErrorMessage,
  streamConversationMessage,
  updateConversationPositions,
} from '../../../shared/api'
import { settingsConfig } from '../../../shared/config/settings'
import { frontendLogger } from '../../../shared/logging/logger'
import type { ChatStreamEvent } from '../../../shared/api'
import type { ContentBlock } from '../../../shared/api/workspace'
import { isApiError } from '../../../shared/api'
import { useSessionStore } from '../../session'
import type { ChatWorkbenchStore, SendMessageHandlers, SessionContextResult } from './types'
import type { MessageNode } from '../../../entities'

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== 'object' || typeof b !== 'object') return a === b
  
  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => isEqual(item, b[index]))
  }
  
  if (Array.isArray(a) || Array.isArray(b)) return false
  
  const aKeys = Object.keys(aObj)
  const bKeys = Object.keys(bObj)
  if (aKeys.length !== bKeys.length) return false
  
  return aKeys.every(key => isEqual(aObj[key], bObj[key]))
}

function mergeContentBlocks(blocks: ContentBlock[], newBlock: ContentBlock): ContentBlock[] {
  const deltaTypes = ['thinking_delta', 'text_delta', 'plan_delta']
  
  if (deltaTypes.includes(newBlock.type) && blocks.length > 0) {
    const lastBlock = blocks[blocks.length - 1]
    if (lastBlock.type === newBlock.type) {
      const merged = [...blocks]
      merged[merged.length - 1] = {
        ...lastBlock,
        content: lastBlock.content + (newBlock.content ?? '')
      }
      return merged
    }
  }
  
  return [...blocks, newBlock]
}

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

function updateConversationMessagesCache(state: ChatWorkbenchStore, conversationId: string, messages: MessageNode[]) {
  return {
    conversationMessagesCache: {
      ...state.conversationMessagesCache,
      [conversationId]: messages
    },
    conversationMessages: state.streamingConversationIds.has(conversationId) ? messages : state.conversationMessages
  }
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
  conversationMessagesCache: {},
  loading: false,
  messagesLoading: false,
  streaming: false,
  streamingConversationIds: new Set(),
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
      conversationMessagesCache: {},
      loading: false,
      messagesLoading: false,
      streaming: false,
      streamingConversationIds: new Set(),
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
      set(state => ({
        conversationMessagesCache: {
          ...state.conversationMessagesCache,
          [conversationId]: conversationMessages
        },
        conversationMessages: state.streamingConversationIds.has(conversationId) ? state.conversationMessages : conversationMessages
      }))
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

    await get().loadConversationBundle(conversationId)
    
    set(state => {
      const cachedMessages = state.conversationMessagesCache[conversationId]
      return { 
        conversationMessages: cachedMessages || [],
        messagesError: null 
      }
    })
    
    // 如果缓存中没有，异步加载
    if (!get().conversationMessagesCache[conversationId]) {
      void get().loadConversationMessages(conversationId)
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

  async cascadeDeleteConversationFromSession(conversationId: string) {
    const { currentSessionId } = useSessionStore.getState()

    if (!currentSessionId) {
      return
    }

    try {
      set({ error: null })
      await cascadeDeleteConversation(conversationId)

      const currentSessionDetail = await useSessionStore.getState().loadSessionDetail(currentSessionId)
      const summaries = currentSessionDetail ? currentSessionDetail.conversations ?? (await fetchSessionConversations(currentSessionId)) : []
      const conversationNodes: ConversationNode[] = summaries.map((item) => ({ ...item }))

      set({ conversationNodes })
    } catch (caughtError) {
      set({ error: getErrorMessage(caughtError, '级联删除对话节点失败') })
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

  async sendMessageToConversation(conversationId: string, messageText: string, enableContext: boolean, handlers: SendMessageHandlers = {}) {
    const { currentSessionId } = useSessionStore.getState()

    if (!currentSessionId) {
      return
    }

    const { onEvent, onStreamError } = handlers
    const abortController = new AbortController()
    activeStreamAbortController = abortController
    let streamingMessageId: string | null = null
    const streamingContentBlocks: ContentBlock[] = []

    try {
      set(state => ({ ...state, streaming: true, streamingConversationIds: new Set([...state.streamingConversationIds, conversationId]) }))
      frontendLogger.info('send_message', {
        extra: {
          conversation_id: conversationId,
          message_length: messageText.length,
          enable_context: enableContext,
        },
      })

      await streamConversationMessage(
        conversationId,
        {
          message: messageText,
          enable_context: enableContext,
        },
        {
          signal: abortController.signal,
          onEvent(event: ChatStreamEvent) {
            onEvent?.(event)

            if ('type' in event && event.type === 'message_created') {
              streamingMessageId = event.message_id ?? `msg-${conversationId}-${Date.now()}`
              const newMessage: MessageNode = {
                id: streamingMessageId,
                conversationId: event.conversation_id ?? conversationId,
                userContent: event.user_content ?? messageText,
                assistantContent: '',
                status: 'streaming',
              }
              set(state => {
                const currentMessages = state.conversationMessagesCache[conversationId] || []
                const updatedMessages = [...currentMessages, newMessage]
                return updateConversationMessagesCache(state, conversationId, updatedMessages)
              })
              return
            }

            if ('content_blocks' in event) {
              for (const block of event.content_blocks) {
                streamingContentBlocks.push(block)
                
                if (block.type !== 'done' && block.type !== 'error') {
                  set(state => {
                    const currentMessages = state.conversationMessagesCache[conversationId] || []
                    const lastMessage = currentMessages[currentMessages.length - 1]
                    const isStreaming = lastMessage?.status === 'streaming'

                    if (isStreaming) {
                      const currentBlocks: ContentBlock[] = lastMessage.assistantContent 
                        ? JSON.parse(lastMessage.assistantContent) 
                        : []
                      const updatedBlocks = mergeContentBlocks(currentBlocks, block)
                      const updatedMessages = [...currentMessages]
                      updatedMessages[updatedMessages.length - 1] = {
                        ...lastMessage,
                        assistantContent: JSON.stringify(updatedBlocks)
                      }
                      return updateConversationMessagesCache(state, conversationId, updatedMessages)
                    }

                    return state
                  })
                }

                if (block.type === 'done') {
                  set(state => {
                    const currentMessages = state.conversationMessagesCache[conversationId] || []
                    const lastMessage = currentMessages[currentMessages.length - 1]
                    if (lastMessage?.status === 'streaming') {
                      const updatedMessages = [...currentMessages]
                      updatedMessages[updatedMessages.length - 1] = {
                        ...lastMessage,
                        status: 'completed'
                      }
                      return updateConversationMessagesCache(state, conversationId, updatedMessages)
                    }
                    return state
                  })
                }

                if (block.type === 'error') {
                  set(state => {
                    const currentMessages = state.conversationMessagesCache[conversationId] || []
                    const lastMessage = currentMessages[currentMessages.length - 1]
                    if (lastMessage?.status === 'streaming') {
                      const updatedMessages = [...currentMessages]
                      updatedMessages[updatedMessages.length - 1] = {
                        ...lastMessage,
                        status: 'error'
                      }
                      return updateConversationMessagesCache(state, conversationId, updatedMessages)
                    }
                    return state
                  })

                  onStreamError?.(event)
                }
              }
            } else {
              if ('type' in event && event.type === 'done') {
                set(state => {
                  const currentMessages = state.conversationMessagesCache[conversationId] || []
                  const lastMessage = currentMessages[currentMessages.length - 1]
                  if (lastMessage?.status === 'streaming') {
                    const updatedMessages = [...currentMessages]
                    updatedMessages[updatedMessages.length - 1] = {
                      ...lastMessage,
                      status: 'completed'
                    }
                    return updateConversationMessagesCache(state, conversationId, updatedMessages)
                  }
                  return state
                })
              }

              if ('type' in event && event.type === 'error') {
                set(state => {
                  const currentMessages = state.conversationMessagesCache[conversationId] || []
                  const lastMessage = currentMessages[currentMessages.length - 1]
                  if (lastMessage?.status === 'streaming') {
                    const updatedMessages = [...currentMessages]
                    updatedMessages[updatedMessages.length - 1] = {
                      ...lastMessage,
                      status: 'error'
                    }
                    return updateConversationMessagesCache(state, conversationId, updatedMessages)
                  }
                  return state
                })

                onStreamError?.(event)
              }
            }
          },
        },
      )

      if (streamingMessageId) {
        ;(async () => {
          try {
            const settings = await httpGet<Record<string, unknown>>(settingsConfig.endpoint)
            const debugSettings = settings?.debug as Record<string, unknown> | undefined
            const consistencyCheckEnabled = debugSettings?.consistency_check === true
            
            if (!consistencyCheckEnabled) {
              return
            }
            
            const dbMessages = await fetchConversationMessages(conversationId)
            const dbMessage = dbMessages.find(m => m.id === streamingMessageId)
            
            if (dbMessage) {
              const cachedMessages = get().conversationMessagesCache[conversationId] || []
              const cachedMessage = cachedMessages.find(m => m.id === streamingMessageId)
              
              const dbBlocks = JSON.parse(dbMessage.assistantContent || '[]')
              
              if (!isEqual(streamingContentBlocks, dbBlocks)) {
                console.warn('[Cache Consistency] Content blocks mismatch detected', {
                  conversationId,
                  messageId: streamingMessageId,
                  streamingBlocks: streamingContentBlocks,
                  dbBlocks,
                  cachedContent: cachedMessage?.assistantContent,
                  dbContent: dbMessage.assistantContent
                })
                message.warning('消息缓存与数据库不一致，请查看控制台了解详情')
              }
            }
          } catch (verifyError) {
            console.error('[Cache Consistency] Failed to verify content:', verifyError)
          }
        })()
      }

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
      set(state => { const newSet = new Set(state.streamingConversationIds); newSet.delete(conversationId); return { ...state, streaming: newSet.size > 0, streamingConversationIds: newSet } })
    }
  },

  async cancelStreamingConversation() {
    const { streamingConversationIds } = get()

    if (streamingConversationIds.size === 0) {
      return
    }

    activeStreamAbortController?.abort()

    const promises = Array.from(streamingConversationIds).map(async (conversationId) => {
      try {
        await cancelConversation(conversationId)
      } catch (err) {
        frontendLogger.error('cancel_conversation_failed', {
          extra: {
            conversation_id: conversationId,
            error: getErrorMessage(err, 'cancel_request_failed'),
          },
        })
      }
      try {
        await Promise.all([get().loadConversationBundle(conversationId), get().loadConversationMessages(conversationId)])
      } catch (reloadErr) {
        frontendLogger.error('cancel_state_reload_failed', {
          extra: {
            conversation_id: conversationId,
            error: getErrorMessage(reloadErr, 'reload_after_cancel_failed'),
          },
        })
      }
    })

    await Promise.all(promises)

    const { currentSessionId } = useSessionStore.getState()
    if (currentSessionId) {
      const currentSessionDetail = await useSessionStore.getState().loadSessionDetail(currentSessionId)
      const summaries = currentSessionDetail ? currentSessionDetail.conversations ?? (await fetchSessionConversations(currentSessionId)) : []
      const conversationNodes: ConversationNode[] = summaries.map((item) => ({ ...item }))
      set({ conversationNodes })
    }

    set(state => ({ ...state, streaming: false, streamingConversationIds: new Set() }))
  },
}))
