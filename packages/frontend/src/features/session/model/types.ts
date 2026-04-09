import type { SessionDetail, SessionId, SessionSummary } from '../../../entities'

export type EnsureConversationOptions = {
  parentConversationId?: string | null
}

export type SessionState = {
  sessionList: SessionSummary[]
  currentSessionId: SessionId | null
  currentSessionDetail: SessionDetail | null
  sessionLoading: boolean
  sessionError: string | null

  creatingSession: boolean
  deletingSessionId: SessionId | null
}

export type SessionActions = {
  loadSessions: (preferredSessionId?: SessionId | null) => Promise<void>
  loadSessionDetail: (sessionId: SessionId) => Promise<SessionDetail | null>
  selectSession: (sessionId: SessionId) => Promise<SessionDetail | null>

  createSession: (title?: string) => Promise<SessionDetail | null>
  deleteSession: (sessionId: SessionId) => Promise<SessionDetail | null>
  ensureConversationForCurrentSession: (options?: EnsureConversationOptions) => Promise<string | null>

  setSessionDetail: (detail: SessionDetail | null) => void
  clearSessionError: () => void
  resetSessionState: () => void
}

export type SessionStore = SessionState & SessionActions
