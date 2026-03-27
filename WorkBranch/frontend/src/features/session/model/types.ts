import type { SessionDetail, SessionId, SessionSummary } from '../../../entities'

export type SessionState = {
  sessionList: SessionSummary[]
  currentSessionId: SessionId | null
  currentSessionDetail: SessionDetail | null
  activeConversationId: string | null
  sessionLoading: boolean
  sessionError: string | null
}

export type SessionActions = {
  loadSessions: (preferredSessionId?: SessionId | null) => Promise<void>
  loadSessionDetail: (sessionId: SessionId) => Promise<SessionDetail | null>
  selectSession: (sessionId: SessionId) => Promise<SessionDetail | null>
  setSessionDetail: (detail: SessionDetail | null) => void
  clearSessionError: () => void
  resetSessionState: () => void
}

export type SessionStore = SessionState & SessionActions
