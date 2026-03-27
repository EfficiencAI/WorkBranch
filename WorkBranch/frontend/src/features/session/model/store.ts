import { create } from 'zustand'
import type { SessionId } from '../../../entities'
import {
  fetchSessionConversations,
  fetchSessionDetail,
  fetchSessions,
  getErrorMessage,
} from '../../../shared/api'
import type { SessionStore } from './types'

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessionList: [],
  currentSessionId: null,
  currentSessionDetail: null,
  activeConversationId: null,
  sessionLoading: false,
  sessionError: null,

  clearSessionError() {
    set({ sessionError: null })
  },

  resetSessionState() {
    set({
      sessionList: [],
      currentSessionId: null,
      currentSessionDetail: null,
      activeConversationId: null,
      sessionLoading: false,
      sessionError: null,
    })
  },

  setSessionDetail(detail) {
    set({
      currentSessionDetail: detail,
      activeConversationId: detail?.activeConversationId ?? null,
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
        set({ currentSessionDetail: null, activeConversationId: null })
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
      const conversationRefs = await fetchSessionConversations(sessionId)

      const nextDetail = {
        ...detail,
        conversationRefs,
      }

      set({
        currentSessionId: sessionId,
        currentSessionDetail: nextDetail,
        activeConversationId: nextDetail.activeConversationId ?? null,
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
    set({ currentSessionId: sessionId })
    return get().loadSessionDetail(sessionId)
  },
}))
