import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button, Card, Dropdown, Space, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { useEffect, useMemo } from 'react'
import type { ConversationDetail, MessageNode, SessionDetail, SessionId, WorkspaceDetail } from '../../entities'
import { EmptyState, StatusTag } from '../../shared/ui'
import { MessageComposer } from './MessageComposer'

const roleLabelMap = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tool',
} as const

type ConversationCanvasProps = {
  currentSessionId: SessionId | null
  activeConversationId: string | null

  focusedNodeId: string | null
  onFocusNode: (nodeId: string | null) => void

  onEnterConversationFocus: (conversationId: string) => Promise<void>
  onExitConversationFocus: () => Promise<void>

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
  onClick: (nodeId: string | null) => void
  onDoubleClick: (nodeId: string) => void
}

function toStaticPosition(index: number) {
  const positions = [
    { x: 140, y: 140 },
    { x: 500, y: 260 },
    { x: 900, y: 160 },
    { x: 1220, y: 420 },
  ]

  return positions[index] ?? { x: 720 + (index % 3) * 340, y: 600 + Math.floor(index / 3) * 220 }
}

function FlowConversationNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const { node, focused, onClick, onDoubleClick } = data

  return (
    <button
      type="button"
      className={focused ? 'conversation-node conversation-node--focused' : 'conversation-node'}
      onClick={() => onClick(node.id)}
      onDoubleClick={() => onDoubleClick(node.id)}
      aria-label={`聚焦节点 ${node.id}`}
    >
      <Card size="small" className={`conversation-node__card conversation-node__card--${node.role}`}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Space wrap>
              <Typography.Text strong>{node.id}</Typography.Text>
              <Typography.Text type="secondary">{roleLabelMap[node.role]}</Typography.Text>
            </Space>
            <StatusTag label={node.status ?? 'ready'} tone="default" />
          </Space>
          <Typography.Paragraph className="conversation-node__summary">{node.content}</Typography.Paragraph>
        </Space>
      </Card>
    </button>
  )
}

const nodeTypes = {
  conversation: FlowConversationNode,
}

function buildOverviewNodes(sessionDetail: SessionDetail | null): MessageNode[] {
  return (sessionDetail?.conversationRefs ?? []).map((ref, index) => ({
    id: ref.conversationId,
    parentId: index === 0 ? null : sessionDetail?.conversationRefs?.[index - 1]?.conversationId ?? null,
    role: 'assistant',
    content: `Conversation ${ref.conversationId}`,
    status: sessionDetail?.activeConversationId === ref.conversationId ? 'focused' : 'ready',
  }))
}

function FlowViewport({
  currentSessionId,
  activeConversationId,
  focusedNodeId,
  onFocusNode,
  onEnterConversationFocus,
  onExitConversationFocus,
  sessionDetail,
  conversationDetail,
  workspaceDetail,
  nodes,
  sending,
  onSendMessage,
  onCreateConversation,
}: ConversationCanvasProps) {
  const reactFlow = useReactFlow<Node<FlowNodeData>, Edge>()

  const displayNodes = useMemo(() => {
    if (activeConversationId && nodes.length) {
      return nodes
    }

    return buildOverviewNodes(sessionDetail)
  }, [activeConversationId, nodes, sessionDetail])

  const flowNodes = useMemo<Array<Node<FlowNodeData>>>(() => {
    return displayNodes.map((node, index) => ({
      id: node.id,
      type: 'conversation',
      position: toStaticPosition(index),
      data: {
        node,
        focused: activeConversationId ? activeConversationId === node.id : focusedNodeId === node.id,
        onClick: onFocusNode,
        onDoubleClick(nodeId: string) {
          if (activeConversationId) {
            return
          }

          void onEnterConversationFocus(nodeId)
        },
      },
      draggable: true,
    }))
  }, [activeConversationId, displayNodes, focusedNodeId, onEnterConversationFocus, onFocusNode])

  const flowEdges = useMemo<Edge[]>(() => {
    return displayNodes
      .filter((node) => node.parentId)
      .map((node) => ({
        id: `${node.parentId}-${node.id}`,
        source: node.parentId as string,
        target: node.id,
        animated: focusedNodeId === node.id,
      }))
  }, [displayNodes, focusedNodeId])

  useEffect(() => {
    if (!activeConversationId || nodes.length || !currentSessionId || !sessionDetail?.conversationRefs?.length) {
      return
    }

    const targetExists = sessionDetail.conversationRefs.some((ref) => ref.conversationId === activeConversationId)
    if (!targetExists) {
      void onExitConversationFocus()
    }
  }, [activeConversationId, currentSessionId, nodes.length, onExitConversationFocus, sessionDetail])

  useEffect(() => {
    if (!flowNodes.length) {
      return
    }

    requestAnimationFrame(() => {
      if (activeConversationId) {
        const targetNode = flowNodes.find((node) => node.id === activeConversationId) ?? flowNodes[0]
        if (targetNode) {
          void reactFlow.setCenter(targetNode.position.x + 160, targetNode.position.y + 90, {
            zoom: nodes.length ? 1.2 : 0.9,
            duration: 240,
          })
          return
        }
      }

      void reactFlow.fitView({ padding: 0.2, duration: 240 })
    })
  }, [activeConversationId, flowNodes, nodes.length, reactFlow])



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
        <div className="conversation-canvas__overlay conversation-canvas__overlay--meta">
          <Space wrap>
            <StatusTag label={`workspace ${conversationDetail?.workspaceId ?? 'N/A'}`} tone="default" />
            <StatusTag label={`节点 ${displayNodes.length}`} tone="processing" />
            <StatusTag label={workspaceDetail?.dir ? 'workspace 已定位' : 'workspace 未定位'} tone="warning" />
            <StatusTag label={activeConversationId ? '聚焦态' : '概览态'} tone={activeConversationId ? 'success' : 'default'} />
          </Space>
          <Typography.Text type="secondary" className="conversation-canvas__meta-text">
            {activeConversationId
              ? '当前处于 React Flow 聚焦态；双击置值进入，拖拽/缩放/空白区域操作会退出。'
              : '当前处于 React Flow 概览态；可双击会话节点进入聚焦查看。'}
          </Typography.Text>
        </div>

        <div className="conversation-canvas__controls" role="toolbar" aria-label="画布控制">
          <Button
            className="conversation-canvas__control-button"
            onClick={() => {
              if (activeConversationId) {
                void onExitConversationFocus()
                return
              }

              void reactFlow.zoomOut({ duration: 180 })
            }}
          >
            -
          </Button>
          <Button
            className="conversation-canvas__control-button"
            onClick={() => {
              if (activeConversationId) {
                void onExitConversationFocus()
                return
              }

              void reactFlow.zoomIn({ duration: 180 })
            }}
          >
            +
          </Button>
          <Button
            className="conversation-canvas__control-button"
            onClick={() => {
              if (activeConversationId) {
                void onExitConversationFocus()
                return
              }

              void reactFlow.fitView({ padding: 0.2, duration: 240 })
            }}
          >
            适配
          </Button>
        </div>

        <ReactFlow
          className="conversation-canvas__flow"
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={!activeConversationId}
          panOnDrag={!activeConversationId}
          zoomOnScroll={!activeConversationId}
          zoomOnPinch={!activeConversationId}
          zoomOnDoubleClick={!activeConversationId}
          nodesConnectable={false}
          elementsSelectable
          onNodeClick={(_, node) => onFocusNode(node.id)}
          onNodeDragStart={() => {
            if (activeConversationId) {
              void onExitConversationFocus()
            }
          }}
          onPaneClick={() => {
            onFocusNode(null)
            if (activeConversationId) {
              void onExitConversationFocus()
            }
          }}
          onMoveStart={() => {
            if (activeConversationId) {
              void onExitConversationFocus()
            }
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={32} size={1} color="var(--app-grid-color)" />
          <MiniMap pannable zoomable className="conversation-canvas__minimap" />
          <Controls className="conversation-canvas__flow-controls" showInteractive={false} />
        </ReactFlow>

        <div className="conversation-canvas__composer-shell">
          <div className="conversation-node conversation-node--composer">
            <Card size="small" className="conversation-node__card conversation-node__card--composer">
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                  <Space wrap>
                    <Typography.Text strong>新对话节点</Typography.Text>
                    <Typography.Text type="secondary">Draft</Typography.Text>
                  </Space>
                  <StatusTag label={sending ? '发送中' : '待发送'} tone="processing" />
                </Space>
                <MessageComposer workspaceId={conversationDetail?.workspaceId ?? null} sending={sending} onSend={onSendMessage} />
              </Space>
            </Card>
          </div>
        </div>

        {!conversationDetail && !activeConversationId ? (
          <div className="conversation-canvas__hint">
            <EmptyState title="当前会话处于概览态" description="可双击会话节点进入聚焦查看；也可在画布空白处右键创建对话。" />
          </div>
        ) : null}
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
