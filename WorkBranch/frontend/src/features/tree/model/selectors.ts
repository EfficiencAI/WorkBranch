import type { TreeStore } from './types'

export const selectFocusedNodeId = (state: TreeStore) => state.focusedNodeId
export const selectSelectedNodeId = (state: TreeStore) => state.selectedNodeId
