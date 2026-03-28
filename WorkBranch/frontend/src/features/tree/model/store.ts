import { create } from 'zustand'
import type { TreeStore } from './types'

export const useTreeStore = create<TreeStore>((set) => ({
  focusedConversationId: null,
  selectedConversationId: null,

  setFocusedConversationId(conversationId) {
    set({ focusedConversationId: conversationId })
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

  resetTreeUiState() {
    set({ focusedConversationId: null, selectedConversationId: null })
  },
}))
