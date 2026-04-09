import { create } from 'zustand'
import type { TreeStore } from './types'

export const useTreeStore = create<TreeStore>((set) => ({
  focusedConversationId: null,
  halfPreviewConversationId: null,
  selectedConversationId: null,
  lockedSendConversationId: null,

  setFocusedConversationId(conversationId) {
    if (conversationId) {
      set({ focusedConversationId: conversationId, halfPreviewConversationId: null })
      return
    }

    set({ focusedConversationId: null })
  },

  clearFocusedConversationId() {
    set({ focusedConversationId: null })
  },

  setHalfPreviewConversationId(conversationId) {
    if (conversationId) {
      set({ halfPreviewConversationId: conversationId, focusedConversationId: null })
      return
    }

    set({ halfPreviewConversationId: null })
  },

  clearHalfPreviewConversationId() {
    set({ halfPreviewConversationId: null })
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
    set({ focusedConversationId: null, halfPreviewConversationId: null, selectedConversationId: null, lockedSendConversationId: null })
  },
}))
