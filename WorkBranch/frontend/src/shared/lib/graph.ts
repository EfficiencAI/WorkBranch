export type GraphEdge<TMeta = unknown> = {
  source: string
  target: string
  meta?: TMeta
}

export function buildAdjacencyMap<TMeta = unknown>(edges: GraphEdge<TMeta>[]) {
  const adjacencyMap = new Map<string, string[]>()

  for (const edge of edges) {
    const nextTargets = adjacencyMap.get(edge.source) ?? []
    nextTargets.push(edge.target)
    adjacencyMap.set(edge.source, nextTargets)
  }

  return adjacencyMap
}
