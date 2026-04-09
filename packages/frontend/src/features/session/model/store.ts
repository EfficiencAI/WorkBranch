import { create } from 'zustand'
import type { SessionId } from '../../../entities'
import {
  createConversation,
  createSession as createSessionRequest,
  deleteSession as deleteSessionRequest,
  fetchSessionConversations,
  fetchSessionDetail,
  fetchSessions,
  getErrorMessage,
} from '../../../shared/api'
import type { SessionStore } from './types'

function pickNextSessionIdAfterDelete(sessionIds: SessionId[], sessionId: SessionId) {
  const currentIndex = sessionIds.findIndex((id) => id === sessionId)
  if (currentIndex === -1) {
    return null
  }

  return sessionIds[currentIndex + 1] ?? sessionIds[currentIndex - 1] ?? null
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessionList: [],
  currentSessionId: null,
  currentSessionDetail: null,
  sessionLoading: false,
  sessionError: null,
  creatingSession: false,
  deletingSessionId: null,

  clearSessionError() {
    set({ sessionError: null })
  },

  resetSessionState() {
    set({
      sessionList: [],
      currentSessionId: null,
      currentSessionDetail: null,
      sessionLoading: false,
      sessionError: null,
      creatingSession: false,
      deletingSessionId: null,
    })
  },

  setSessionDetail(detail) {
    const existingConversations = get().currentSessionDetail?.conversations
    const nextDetail = detail
      ? {
          ...detail,
          conversations: detail.conversations ?? existingConversations,
        }
      : null

    set({
      currentSessionDetail: nextDetail,
    })
  },

  async loadSessions(preferredSessionId?: SessionId | null) {
    try {
      set({ sessionLoading: true, sessionError: null })

      const nextSessions = await fetchSessions()
      const preferred = preferredSessionId ?? null
      const resolvedPreferred = preferred
        ? nextSessions.find((item) => item.id === preferred)?.id ?? null
        : null
      const nextSessionId = resolvedPreferred ?? nextSessions[0]?.id ?? null

      set({ sessionList: nextSessions, currentSessionId: nextSessionId })

      if (nextSessionId === null || nextSessionId === undefined) {
        set({ currentSessionDetail: null })
        return
      }

      await get().loadSessionDetail(nextSessionId)
    } catch (caughtError) {
      set({ sessionError: getErrorMessage(caughtError, '会话列表加载失败') })
    } finally {
      set({ sessionLoading: false })
    }
  },

  async loadSessionDetail(sessionId: SessionId) {
    try {
      set({ sessionLoading: true, sessionError: null })

      const detail = await fetchSessionDetail(sessionId)
      const conversations = await fetchSessionConversations(sessionId)

      const nextDetail = {
        ...detail,
        conversations,
      }

      set({
        currentSessionId: sessionId,
        currentSessionDetail: nextDetail,
      })

      return nextDetail
    } catch (caughtError) {
      set({ sessionError: getErrorMessage(caughtError, '会话详情加载失败') })
      return null
    } finally {
      set({ sessionLoading: false })
    }
  },

  async selectSession(sessionId: SessionId) {
    const { currentSessionId, currentSessionDetail } = get()
    if (currentSessionId === sessionId && currentSessionDetail) {
      return currentSessionDetail
    }

    set({ currentSessionId: sessionId })
    return get().loadSessionDetail(sessionId)
  },

  async createSession(title?: string) {
    try {
      set({ creatingSession: true, sessionError: null })

      const detail = await createSessionRequest(title)
      const nextSessions = await fetchSessions()

      set({ sessionList: nextSessions, currentSessionId: detail.id })
      return await get().loadSessionDetail(detail.id)
    } catch (caughtError) {
      set({ sessionError: getErrorMessage(caughtError, '会话创建失败') })
      return null
    } finally {
      set({ creatingSession: false })
    }
  },

  async deleteSession(sessionId: SessionId) {
    try {
      set({ deletingSessionId: sessionId, sessionError: null })

      const { currentSessionId, sessionList } = get()
      const sessionIds = sessionList.map((item) => item.id)
      const nextSelectedId =
        currentSessionId === sessionId ? pickNextSessionIdAfterDelete(sessionIds, sessionId) : currentSessionId

      await deleteSessionRequest(sessionId)

      const nextSessions = await fetchSessions()
      set({ sessionList: nextSessions })

      const resolvedNextId = nextSelectedId
        ? nextSessions.find((item) => item.id === nextSelectedId)?.id ?? null
        : null

      if (!resolvedNextId) {
        set({ currentSessionId: null, currentSessionDetail: null })
        return null
      }

      set({ currentSessionId: resolvedNextId })
      return await get().loadSessionDetail(resolvedNextId)
    } catch (caughtError) {
      set({ sessionError: getErrorMessage(caughtError, '会话删除失败') })
      return null
    } finally {
      set({ deletingSessionId: null })
    }
  },

  async ensureConversationForCurrentSession(options = {}) {
    const { currentSessionId } = get()
    if (!currentSessionId) {
      return null
    }

    const created = await createConversation(currentSessionId, undefined, options.parentConversationId ?? null)
    const detail = await get().loadSessionDetail(currentSessionId)
    set({ currentSessionDetail: detail })

    return created.conversationId
  },
}))
