import type { ChatWorkbenchStore } from './types'

export const selectChatWorkbenchLoading = (state: ChatWorkbenchStore) => state.loading
export const selectChatWorkbenchMessagesLoading = (state: ChatWorkbenchStore) => state.messagesLoading
export const selectChatWorkbenchError = (state: ChatWorkbenchStore) => state.error
export const selectChatWorkbenchMessagesError = (state: ChatWorkbenchStore) => state.messagesError
export const selectChatWorkbenchConversationDetail = (state: ChatWorkbenchStore) => state.conversationDetail
export const selectChatWorkbenchWorkspaceDetail = (state: ChatWorkbenchStore) => state.workspaceDetail
export const selectChatWorkbenchConversationNodes = (state: ChatWorkbenchStore) => state.conversationNodes
export const selectChatWorkbenchConversationMessages = (state: ChatWorkbenchStore) => state.conversationMessages
export const selectChatWorkbenchStreaming = (state: ChatWorkbenchStore) => state.streaming
export const selectChatWorkbenchStreamingConversationIds = (state: ChatWorkbenchStore) => state.streamingConversationIds
