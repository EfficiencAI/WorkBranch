export type TreeState = {
  focusedConversationId: string | null
  selectedConversationId: string | null
  lockedSendConversationId: string | null
}

export type TreeActions = {
  setFocusedConversationId: (conversationId: string | null) => void
  clearFocusedConversationId: () => void
  setSelectedConversationId: (conversationId: string | null) => void
  clearSelectedConversationId: () => void
  setLockedSendConversationId: (conversationId: string | null) => void
  clearLockedSendConversationId: () => void
  resetTreeUiState: () => void
}

export type TreeStore = TreeState & TreeActions
