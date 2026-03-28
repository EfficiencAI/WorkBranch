export type TreeState = {
  focusedNodeId: string | null
  selectedNodeId: string | null
}

export type TreeActions = {
  setFocusedNodeId: (nodeId: string | null) => void
  clearFocusedNodeId: () => void
  setSelectedNodeId: (nodeId: string | null) => void
  clearSelectedNodeId: () => void
  resetTreeUiState: () => void
}

export type TreeStore = TreeState & TreeActions
