import type { ChatWorkbenchStore } from './types'

export const selectChatWorkbenchLoading = (state: ChatWorkbenchStore) => state.loading
export const selectChatWorkbenchError = (state: ChatWorkbenchStore) => state.error
export const selectChatWorkbenchSessions = (state: ChatWorkbenchStore) => state.sessions
export const selectChatWorkbenchSelectedSessionId = (state: ChatWorkbenchStore) => state.selectedSessionId
export const selectChatWorkbenchSessionDetail = (state: ChatWorkbenchStore) => state.sessionDetail
export const selectChatWorkbenchConversationDetail = (state: ChatWorkbenchStore) => state.conversationDetail
export const selectChatWorkbenchWorkspaceDetail = (state: ChatWorkbenchStore) => state.workspaceDetail
export const selectChatWorkbenchNodes = (state: ChatWorkbenchStore) => state.nodes
export const selectChatWorkbenchStreaming = (state: ChatWorkbenchStore) => state.streaming
