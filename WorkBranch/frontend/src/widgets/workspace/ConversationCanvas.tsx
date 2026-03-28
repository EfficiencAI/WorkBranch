import { Background, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button, Card, Dropdown, Space, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { useEffect, useMemo } from 'react'
import { useSettings } from '../../app/settings'
import type { ConversationDetail, MessageNode, SessionDetail, SessionId, WorkspaceDetail } from '../../entities'
import { selectFocusedNodeId, selectSelectedNodeId, useTreeStore } from '../../features'
import { EmptyState, StatusTag } from '../../shared/ui'
import { MessageComposer } from './MessageComposer'

const roleLabelMap = {
  system: 'System',
  user: '用户',
  assistant: 'Agent',
  tool: 'Tool',
} as const

type ConversationCanvasProps = {
  currentSessionId: SessionId | null
  focusedNodeId: string | null
  selectedNodeId: string | null
  sessionDetail: SessionDetail | null
  conversationDetail: ConversationDetail | null
  workspaceDetail: WorkspaceDetail | null
  nodes: MessageNode[]
  sending: boolean
  onSendMessage: (message: string) => Promise<void>
  onCreateConversation: () => Promise<void>
}

type FlowNodeData = {
  node: MessageNode
  focused: boolean
  selected: boolean
  onClick: (nodeId: string) => void
  onDoubleClick: (nodeId: string) => void
  onBuildFromNode: (nodeId: string) => void
}

function summarizeContent(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '空对话'
  }

  return normalized.length > 96 ? `${normalized.slice(0, 96)}…` : normalized
}

function buildTreeLayout(nodes: MessageNode[]) {
  const childMap = new Map<string | null, MessageNode[]>()
  for (const node of nodes) {
    const key = node.parentId ?? null
    const siblings = childMap.get(key) ?? []
    siblings.push(node)
    childMap.set(key, siblings)
  }

  for (const siblings of childMap.values()) {
    siblings.sort((left, right) => (left.createdAt ?? '').localeCompare(right.createdAt ?? '') || left.id.localeCompare(right.id))
  }

  const levels: MessageNode[][] = []
  const queue = (childMap.get(null) ?? []).map((node) => ({ node, depth: 0 }))
  const seen = new Set<string>()

  while (queue.length) {
    const current = queue.shift()
    if (!current || seen.has(current.node.id)) {
      continue
    }

    seen.add(current.node.id)
    if (!levels[current.depth]) {
      levels[current.depth] = []
    }
    levels[current.depth].push(current.node)

    for (const child of childMap.get(current.node.id) ?? []) {
      queue.push({ node: child, depth: current.depth + 1 })
    }
  }

  const fallbackNodes = nodes.filter((node) => !seen.has(node.id))
  if (fallbackNodes.length) {
    const depth = levels.length
    levels[depth] = fallbackNodes
  }

  const positions = new Map<string, { x: number; y: number }>()
  levels.forEach((level, depth) => {
    level.forEach((node, index) => {
      positions.set(node.id, {
        x: index * 380,
        y: depth * 240,
      })
    })
  })

  return positions
}

function FlowConversationNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const { node, focused, selected, onClick, onDoubleClick, onBuildFromNode } = data
  const menuItems: MenuProps['items'] = [
    {
      key: 'build-from-node',
      label: '为此节点构建消息',
    },
  ]

  return (
    <Dropdown
      menu={{
        items: menuItems,
        onClick: ({ key }) => {
          if (key === 'build-from-node') {
            onBuildFromNode(node.id)
          }
        },
      }}
      trigger={['contextMenu']}
    >
      <button
        type="button"
        className={focused ? 'conversation-node conversation-node--focused' : selected ? 'conversation-node conversation-node--selected' : 'conversation-node'}
        onClick={() => onClick(node.id)}
        onDoubleClick={() => onDoubleClick(node.id)}
        aria-label={`查看节点 ${node.id}`}
      >
        <Card size="small" className={`conversation-node__card conversation-node__card--${node.role}`}>
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
              <Space wrap>
                <Typography.Text strong>{node.id}</Typography.Text>
                <Typography.Text type="secondary">{roleLabelMap[node.role]}</Typography.Text>
              </Space>
              <StatusTag label={focused ? 'focused' : selected ? 'selected' : node.status ?? 'ready'} tone={focused ? 'warning' : selected ? 'processing' : 'default'} />
            </Space>
            <Typography.Paragraph className="conversation-node__summary">{summarizeContent(node.content)}</Typography.Paragraph>
          </Space>
        </Card>
      </button>
    </Dropdown>
  )
}

const nodeTypes = {
  conversation: FlowConversationNode,
}

function FlowViewport({
  currentSessionId,
  focusedNodeId,
  selectedNodeId,
  sessionDetail,
  conversationDetail,
  workspaceDetail,
  nodes,
  sending,
  onSendMessage,
  onCreateConversation,
}: ConversationCanvasProps) {
  const reactFlow = useReactFlow<Node<FlowNodeData>, Edge>()
  const { settings } = useSettings()
  const setFocusedNodeId = useTreeStore((state) => state.setFocusedNodeId)
  const setSelectedNodeId = useTreeStore((state) => state.setSelectedNodeId)
  const storeFocusedNodeId = useTreeStore(selectFocusedNodeId)
  const storeSelectedNodeId = useTreeStore(selectSelectedNodeId)

  const showDebugOverlay = settings?.ui && typeof settings.ui === 'object' && settings.ui !== null && 'show_debug_overlay' in settings.ui
    ? settings.ui.show_debug_overlay === true
    : false

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId])
  const focusedNode = useMemo(() => nodes.find((node) => node.id === focusedNodeId) ?? null, [focusedNodeId, nodes])
  const displayNodes = useMemo(() => (focusedNode ? [focusedNode] : nodes), [focusedNode, nodes])
  const layoutMap = useMemo(() => buildTreeLayout(nodes), [nodes])

  const flowNodes = useMemo<Array<Node<FlowNodeData>>>(() => {
    if (focusedNode) {
      return [
        {
          id: focusedNode.id,
          type: 'conversation',
          position: { x: 0, y: 0 },
          data: {
            node: focusedNode,
            focused: true,
            selected: storeSelectedNodeId === focusedNode.id,
            onClick: setSelectedNodeId,
            onDoubleClick: setFocusedNodeId,
            onBuildFromNode: setSelectedNodeId,
          },
          draggable: false,
        },
      ]
    }

    return displayNodes.map((node) => ({
      id: node.id,
      type: 'conversation',
      position: layoutMap.get(node.id) ?? { x: 0, y: 0 },
      data: {
        node,
        focused: storeFocusedNodeId === node.id,
        selected: storeSelectedNodeId === node.id,
        onClick: setSelectedNodeId,
        onDoubleClick: setFocusedNodeId,
        onBuildFromNode: setSelectedNodeId,
      },
      draggable: false,
    }))
  }, [displayNodes, focusedNode, layoutMap, setFocusedNodeId, setSelectedNodeId, storeFocusedNodeId, storeSelectedNodeId])

  const flowEdges = useMemo<Edge[]>(() => {
    if (focusedNode) {
      return []
    }

    return displayNodes
      .filter((node) => node.parentId)
      .map((node) => ({
        id: `${node.parentId}-${node.id}`,
        source: node.parentId as string,
        target: node.id,
        animated: selectedNodeId === node.id,
      }))
  }, [displayNodes, focusedNode, selectedNodeId])

  useEffect(() => {
    if (!flowNodes.length) {
      return
    }

    requestAnimationFrame(() => {
      if (focusedNode) {
        void reactFlow.setCenter(180, 120, { zoom: 1.1, duration: 240 })
        return
      }

      void reactFlow.fitView({ padding: 0.2, duration: 240 })
    })
  }, [flowNodes, focusedNode, reactFlow])

  const canvasMenuItems = useMemo<MenuProps['items']>(
    () => [
      {
        key: 'create-conversation',
        label: '创建对话',
      },
    ],
    [],
  )

  return (
    <Dropdown
      menu={{
        items: canvasMenuItems,
        onClick: ({ key }) => {
          if (key === 'create-conversation') {
            void onCreateConversation()
          }
        },
      }}
      trigger={['contextMenu']}
    >
      <div className="conversation-canvas__viewport">
        {showDebugOverlay ? (
          <div className="conversation-canvas__overlay conversation-canvas__overlay--meta">
            <Space wrap>
              <StatusTag label={`session ${currentSessionId ?? 'N/A'}`} tone="default" />
              <StatusTag label={`workspace ${conversationDetail?.workspaceId ?? 'N/A'}`} tone="default" />
              <StatusTag label={`节点 ${nodes.length}`} tone="processing" />
              <StatusTag label={workspaceDetail?.dir ? 'workspace 已定位' : 'workspace 未定位'} tone="warning" />
              <StatusTag label={focusedNode ? '聚焦态' : '概览态'} tone={focusedNode ? 'success' : 'default'} />
            </Space>
            <Typography.Text type="secondary" className="conversation-canvas__meta-text">
              {focusedNode ? '当前处于节点聚焦态；仅展示该节点完整内容，需点击按钮返回概览。' : '当前显示该 session 下聚合后的真实节点树，可右键节点设置构建目标。'}
            </Typography.Text>
          </div>
        ) : null}

        <div className="conversation-canvas__controls" role="toolbar" aria-label="画布控制">
          <Button className="conversation-canvas__control-button" onClick={() => void reactFlow.zoomOut({ duration: 180 })} disabled={Boolean(focusedNode)}>
            -
          </Button>
          <Button className="conversation-canvas__control-button" onClick={() => void reactFlow.zoomIn({ duration: 180 })} disabled={Boolean(focusedNode)}>
            +
          </Button>
          <Button
            className="conversation-canvas__control-button"
            onClick={() => {
              if (focusedNode) {
                setFocusedNodeId(null)
                return
              }

              void reactFlow.fitView({ padding: 0.2, duration: 240 })
            }}
          >
            {focusedNode ? '返回' : '适配'}
          </Button>
        </div>

        <ReactFlow
          className="conversation-canvas__flow"
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          panOnDrag={!focusedNode}
          zoomOnScroll={!focusedNode}
          zoomOnPinch={!focusedNode}
          zoomOnDoubleClick={!focusedNode}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => {
            if (!focusedNode) {
              setSelectedNodeId(null)
            }
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={32} size={1} color="var(--app-grid-color)" />
        </ReactFlow>

        {!nodes.length ? (
          <div className="conversation-canvas__focused-empty-state">
            <EmptyState title="当前 session 暂无消息节点" description={sessionDetail ? '可右键空白处创建对话，并选择节点作为消息构建目标。' : '请先创建或切换到一个会话。'} />
          </div>
        ) : null}

        {focusedNode ? (
          <div className="conversation-canvas__focused-panel">
            <Card size="small" className={`conversation-node__card conversation-node__card--${focusedNode.role}`}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                  <Space direction="vertical" size={4}>
                    <Typography.Text strong>{focusedNode.id}</Typography.Text>
                    <Typography.Text type="secondary">{roleLabelMap[focusedNode.role]}</Typography.Text>
                  </Space>
                  <Space wrap>
                    <Button size="small" onClick={() => setSelectedNodeId(focusedNode.id)}>
                      为此节点构建消息
                    </Button>
                    <Button size="small" onClick={() => setFocusedNodeId(null)}>
                      退出聚焦态
                    </Button>
                  </Space>
                </Space>
                <div className="conversation-canvas__focused-content">
                  <Typography.Paragraph className="conversation-canvas__focused-text">
                    {focusedNode.content || '空对话'}
                  </Typography.Paragraph>
                </div>
              </Space>
            </Card>
          </div>
        ) : null}

        <div className="conversation-canvas__composer-shell">
          <div className="conversation-node conversation-node--composer">
            <Card size="small" className="conversation-node__card conversation-node__card--composer">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                  <Space wrap>
                    <Typography.Text strong>全局底部输入区</Typography.Text>
                    <Typography.Text type="secondary">Selected Target</Typography.Text>
                  </Space>
                  <StatusTag label={sending ? '发送中' : selectedNode ? '待发送' : '待选择目标'} tone={sending ? 'processing' : selectedNode ? 'success' : 'default'} />
                </Space>
                <MessageComposer
                  workspaceId={conversationDetail?.workspaceId ?? null}
                  selectedNodeId={selectedNode?.id ?? null}
                  selectedNodeLabel={selectedNode ? `${roleLabelMap[selectedNode.role]} · ${selectedNode.id}` : null}
                  sending={sending}
                  onSend={onSendMessage}
                />
              </Space>
            </Card>
          </div>
        </div>
      </div>
    </Dropdown>
  )
}

export function ConversationCanvas(props: ConversationCanvasProps) {
  return (
    <section className="conversation-canvas">
      <div className="conversation-canvas__backdrop" aria-hidden="true">
        <div className="conversation-canvas__glow conversation-canvas__glow--primary" />
        <div className="conversation-canvas__glow conversation-canvas__glow--secondary" />
      </div>

      <ReactFlowProvider>
        <FlowViewport {...props} />
      </ReactFlowProvider>
    </section>
  )
}
