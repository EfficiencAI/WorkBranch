import type { SessionStore } from './types'

export const selectSessionList = (state: SessionStore) => state.sessionList
export const selectCurrentSessionId = (state: SessionStore) => state.currentSessionId
export const selectCurrentSessionDetail = (state: SessionStore) => state.currentSessionDetail
export const selectActiveConversationId = (state: SessionStore) => state.activeConversationId
export const selectSessionLoading = (state: SessionStore) => state.sessionLoading
export const selectSessionError = (state: SessionStore) => state.sessionError
