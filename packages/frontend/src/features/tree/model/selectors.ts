import type { TreeStore } from './types'

export const selectFocusedConversationId = (state: TreeStore) => state.focusedConversationId
export const selectSelectedConversationId = (state: TreeStore) => state.selectedConversationId
export const selectLockedSendConversationId = (state: TreeStore) => state.lockedSendConversationId
