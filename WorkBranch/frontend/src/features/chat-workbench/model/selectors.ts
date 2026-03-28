import type { ChatWorkbenchStore } from './types'

export const selectChatWorkbenchLoading = (state: ChatWorkbenchStore) => state.loading
export const selectChatWorkbenchError = (state: ChatWorkbenchStore) => state.error
export const selectChatWorkbenchConversationDetail = (state: ChatWorkbenchStore) => state.conversationDetail
export const selectChatWorkbenchWorkspaceDetail = (state: ChatWorkbenchStore) => state.workspaceDetail
export const selectChatWorkbenchConversationNodes = (state: ChatWorkbenchStore) => state.conversationNodes
export const selectChatWorkbenchStreaming = (state: ChatWorkbenchStore) => state.streaming
