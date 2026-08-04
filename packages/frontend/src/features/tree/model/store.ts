import { create } from 'zustand'
import type { TreeStore } from './types'

export const useTreeStore = create<TreeStore>((set) => ({
  focusedConversationId: null,
  selectedConversationId: null,
  lockedSendConversationId: null,
  draggingNodeId: null,

  setFocusedConversationId(conversationId) {
    set({ focusedConversationId: conversationId ?? null })
  },

  clearFocusedConversationId() {
    set({ focusedConversationId: null })
  },

  setSelectedConversationId(conversationId) {
    set({ selectedConversationId: conversationId })
  },

  clearSelectedConversationId() {
    set({ selectedConversationId: null })
  },

  setLockedSendConversationId(conversationId) {
    set({ lockedSendConversationId: conversationId, selectedConversationId: conversationId })
  },

  clearLockedSendConversationId() {
    set({ lockedSendConversationId: null, selectedConversationId: null })
  },

  resetTreeUiState() {
    set({ focusedConversationId: null, selectedConversationId: null, lockedSendConversationId: null, draggingNodeId: null })
  },

  setDraggingNodeId(nodeId) {
    set({ draggingNodeId: nodeId })
  },

  clearDraggingNodeId() {
    set({ draggingNodeId: null })
  },
}))
