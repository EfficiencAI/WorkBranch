import { create } from 'zustand'
import type { TreeStore } from './types'

export const useTreeStore = create<TreeStore>((set) => ({
  focusedNodeId: null,
  selectedNodeId: null,

  setFocusedNodeId(nodeId) {
    set({ focusedNodeId: nodeId })
  },

  clearFocusedNodeId() {
    set({ focusedNodeId: null })
  },

  setSelectedNodeId(nodeId) {
    set({ selectedNodeId: nodeId })
  },

  clearSelectedNodeId() {
    set({ selectedNodeId: null })
  },

  resetTreeUiState() {
    set({ focusedNodeId: null, selectedNodeId: null })
  },
}))
