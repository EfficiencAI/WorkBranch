import { Background, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button, Card, Space, Typography } from 'antd'
import { useCallback, useEffect, useMemo } from 'react'
import { useSettings } from '../../app/settings'
import type { ConversationDetail, ConversationNode, MessageNode, SessionDetail, SessionId, WorkspaceDetail } from '../../entities'
import { selectFocusedConversationId, selectSelectedConversationId, useTreeStore } from '../../features'
import { EmptyState, StatusTag } from '../../shared/ui'
import { frontendLogger } from '../../shared/logging/logger'
import { ContextMenu, ContextMenuProvider, useContextMenu } from './ContextMenu'
import { MessageComposer } from './MessageComposer'

type ConversationCanvasProps = {
  currentSessionId: SessionId | null
  focusedConversationId: string | null
  selectedConversationId: string | null
  sessionDetail: SessionDetail | null
  conversationDetail: ConversationDetail | null
  workspaceDetail: WorkspaceDetail | null
  conversationNodes: ConversationNode[]
  conversationMessages: MessageNode[]
  messagesLoading: boolean
  messagesError: string | null
  sending: boolean
  canCreateConversationOnSend: boolean
  onSendMessage: (message: string) => Promise<void>
  onStopMessage: () => Promise<void>
  onCreateConversation: (parentConversationId: string | null) => Promise<void>
}

type FlowNodeData = {
  conversation: ConversationNode
  focused: boolean
  selected: boolean
  onClick: (conversationId: string) => void
  onDoubleClick: (conversationId: string) => void
}

function summarizeConversation(conversation: ConversationNode) {
  if (conversation.title?.trim()) {
    return conversation.title.trim()
  }

  if (conversation.messageCount > 0) {
    return `未命名对话 · ${conversation.messageCount} 条消息`
  }

  return '空对话'
}

function renderMessageRole(role: MessageNode['role']) {
  switch (role) {
    case 'system':
      return '系统'
    case 'user':
      return '用户'
    case 'assistant':
      return '助手'
    case 'tool':
      return '工具'
    default:
      return role
  }
}

function buildFocusContext(conversationNodes: ConversationNode[], focusedConversationId: string | null) {
  if (!focusedConversationId) {
    return conversationNodes
  }

  const focusedConversation = conversationNodes.find((conversation) => conversation.conversationId === focusedConversationId)
  if (!focusedConversation) {
    return conversationNodes
  }

  const relatedIds = new Set<string>([focusedConversationId])
  if (focusedConversation.parentConversationId) {
    relatedIds.add(focusedConversation.parentConversationId)
  }

  conversationNodes
    .filter((conversation) => conversation.parentConversationId === focusedConversationId)
    .forEach((conversation) => {
      relatedIds.add(conversation.conversationId)
    })

  return conversationNodes.filter((conversation) => relatedIds.has(conversation.conversationId))
}

function buildTreeLayout(conversationNodes: ConversationNode[]) {
  const childMap = new Map<string | null, ConversationNode[]>()
  for (const conversation of conversationNodes) {
    const key = conversation.parentConversationId ?? null
    const siblings = childMap.get(key) ?? []
    siblings.push(conversation)
    childMap.set(key, siblings)
  }

  for (const siblings of childMap.values()) {
    siblings.sort(
      (left, right) =>
        (left.createdAt ?? '').localeCompare(right.createdAt ?? '') || left.conversationId.localeCompare(right.conversationId),
    )
  }

  const levels: ConversationNode[][] = []
  const queue = (childMap.get(null) ?? []).map((conversation) => ({ conversation, depth: 0 }))
  const seen = new Set<string>()

  while (queue.length) {
    const current = queue.shift()
    if (!current || seen.has(current.conversation.conversationId)) {
      continue
    }

    seen.add(current.conversation.conversationId)
    if (!levels[current.depth]) {
      levels[current.depth] = []
    }
    levels[current.depth].push(current.conversation)

    for (const child of childMap.get(current.conversation.conversationId) ?? []) {
      queue.push({ conversation: child, depth: current.depth + 1 })
    }
  }

  const fallbackNodes = conversationNodes.filter((conversation) => !seen.has(conversation.conversationId))
  if (fallbackNodes.length) {
    const depth = levels.length
    levels[depth] = fallbackNodes
  }

  const positions = new Map<string, { x: number; y: number }>()
  levels.forEach((level, depth) => {
    level.forEach((conversation, index) => {
      positions.set(conversation.conversationId, {
        x: index * 380,
        y: depth * 240,
      })
    })
  })

  return positions
}

function buildFocusLayout(displayConversations: ConversationNode[], focusedConversationId: string) {
  const focusedConversation = displayConversations.find((conversation) => conversation.conversationId === focusedConversationId)
  const positions = new Map<string, { x: number; y: number }>()

  positions.set(focusedConversationId, { x: 260, y: 180 })

  if (focusedConversation?.parentConversationId) {
    const parent = displayConversations.find((conversation) => conversation.conversationId === focusedConversation.parentConversationId)
    if (parent) {
      positions.set(parent.conversationId, { x: 260, y: 0 })
    }
  }

  const children = displayConversations.filter((conversation) => conversation.parentConversationId === focusedConversationId)
  children.forEach((conversation, index) => {
    positions.set(conversation.conversationId, {
      x: index * 280,
      y: 360,
    })
  })

  displayConversations.forEach((conversation, index) => {
    if (!positions.has(conversation.conversationId)) {
      positions.set(conversation.conversationId, {
        x: index * 280,
        y: 0,
      })
    }
  })

  return positions
}


function FlowConversationNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const { conversation, focused, selected, onClick, onDoubleClick } = data

  return (
    <button
      type="button"
      className={focused ? 'conversation-node conversation-node--focused' : selected ? 'conversation-node conversation-node--selected' : 'conversation-node'}
      onClick={() => onClick(conversation.conversationId)}
      onDoubleClick={() => onDoubleClick(conversation.conversationId)}
      data-conversation-id={conversation.conversationId}
      aria-label={`查看对话 ${conversation.conversationId}`}
    >
      <Card size="small" className="conversation-node__card conversation-node__card--assistant">
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Space direction="vertical" size={2}>
              <Typography.Text strong>{summarizeConversation(conversation)}</Typography.Text>
              <Typography.Text type="secondary">{conversation.conversationId}</Typography.Text>
            </Space>
            <StatusTag
              label={focused ? 'focused' : selected ? 'selected' : conversation.state}
              tone={focused ? 'warning' : selected ? 'processing' : 'default'}
            />
          </Space>
          <Space wrap>
            <StatusTag label={`${conversation.messageCount} 条消息`} tone="default" />
            {conversation.parentConversationId ? <StatusTag label={`父对话 ${conversation.parentConversationId}`} tone="default" /> : <StatusTag label="根对话" tone="success" />}
          </Space>
        </Space>
      </Card>
    </button>
  )
}

const nodeTypes = {
  conversation: FlowConversationNode,
}

function FlowViewport({
  currentSessionId,
  focusedConversationId,
  selectedConversationId,
  sessionDetail,
  conversationDetail,
  workspaceDetail,
  conversationNodes,
  conversationMessages,
  messagesLoading,
  messagesError,
  sending,
  canCreateConversationOnSend,
  onSendMessage,
  onStopMessage,
  onCreateConversation,
}: ConversationCanvasProps) {
  const reactFlow = useReactFlow<Node<FlowNodeData>, Edge>()
  const { settings } = useSettings()
  const setFocusedConversationId = useTreeStore((state) => state.setFocusedConversationId)
  const setSelectedConversationId = useTreeStore((state) => state.setSelectedConversationId)
  const storeFocusedConversationId = useTreeStore(selectFocusedConversationId)
  const storeSelectedConversationId = useTreeStore(selectSelectedConversationId)

  const showDebugOverlay =
    settings?.ui && typeof settings.ui === 'object' && settings.ui !== null && 'show_debug_overlay' in settings.ui
      ? settings.ui.show_debug_overlay === true
      : false

  const selectedConversation = useMemo(
    () => conversationNodes.find((conversation) => conversation.conversationId === selectedConversationId) ?? null,
    [conversationNodes, selectedConversationId],
  )
  const focusedConversation = useMemo(
    () => conversationNodes.find((conversation) => conversation.conversationId === focusedConversationId) ?? null,
    [conversationNodes, focusedConversationId],
  )

  const displayConversations = useMemo(
    () => (focusedConversation ? buildFocusContext(conversationNodes, focusedConversationId) : conversationNodes),
    [conversationNodes, focusedConversation, focusedConversationId],
  )

  const overviewLayoutMap = useMemo(() => buildTreeLayout(conversationNodes), [conversationNodes])
  const focusLayoutMap = useMemo(
    () => (focusedConversationId ? buildFocusLayout(displayConversations, focusedConversationId) : new Map<string, { x: number; y: number }>()),
    [displayConversations, focusedConversationId],
  )

  const flowNodes = useMemo<Array<Node<FlowNodeData>>>(() => {
    return displayConversations.map((conversation) => ({
      id: conversation.conversationId,
      type: 'conversation',
      position: focusedConversation
        ? focusLayoutMap.get(conversation.conversationId) ?? { x: 0, y: 0 }
        : overviewLayoutMap.get(conversation.conversationId) ?? { x: 0, y: 0 },
      data: {
        conversation,
        focused: storeFocusedConversationId === conversation.conversationId,
        selected: storeSelectedConversationId === conversation.conversationId,
        onClick: (conversationId: string) => {
          frontendLogger.info('switch_conversation', {
            extra: {
              conversation_id: conversationId,
              previous_conversation_id: storeSelectedConversationId,
            },
          })
          setSelectedConversationId(conversationId)
        },
        onDoubleClick: setFocusedConversationId,
      },
      draggable: false,
    }))
  }, [
    displayConversations,
    focusLayoutMap,
    focusedConversation,
    overviewLayoutMap,
    setFocusedConversationId,
    setSelectedConversationId,
    storeFocusedConversationId,
    storeSelectedConversationId,
  ])

  const flowEdges = useMemo<Edge[]>(() => {
    return displayConversations
      .filter((conversation) => conversation.parentConversationId)
      .filter((conversation) => displayConversations.some((item) => item.conversationId === conversation.parentConversationId))
      .map((conversation) => ({
        id: `${conversation.parentConversationId}-${conversation.conversationId}`,
        source: conversation.parentConversationId as string,
        target: conversation.conversationId,
        animated: selectedConversationId === conversation.conversationId || focusedConversationId === conversation.conversationId,
      }))
  }, [displayConversations, focusedConversationId, selectedConversationId])

  useEffect(() => {
    if (!flowNodes.length) {
      return
    }

    const timeoutId = setTimeout(() => {
      if (focusedConversation) {
        void reactFlow.setCenter(180, 120, { zoom: 1.1, duration: 240 })
        return
      }

      void reactFlow.fitView({ padding: 0.2, duration: 240, includeHiddenNodes: true })
    }, 50)

    return () => clearTimeout(timeoutId)
  }, [flowNodes, focusedConversation, reactFlow])

  const { setContextMenu } = useContextMenu()

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()

      const target = event.target as HTMLElement
      const nodeElement = target.closest('[data-conversation-id]')

      if (nodeElement) {
        const conversationId = nodeElement.getAttribute('data-conversation-id')
        setContextMenu({
          type: 'node',
          conversationId: conversationId!,
          position: { x: event.clientX, y: event.clientY },
        })
      } else {
        setContextMenu({
          type: 'canvas',
          position: { x: event.clientX, y: event.clientY },
        })
      }
    },
    [setContextMenu],
  )

  return (
    <div className="conversation-canvas__viewport" onContextMenu={handleContextMenu}>
      {showDebugOverlay ? (
        <div className="conversation-canvas__overlay conversation-canvas__overlay--meta">
          <Space wrap>
            <StatusTag label={`session ${currentSessionId ?? 'N/A'}`} tone="default" />
            <StatusTag label={`workspace ${conversationDetail?.workspaceId ?? 'N/A'}`} tone="default" />
            <StatusTag label={`对话 ${conversationNodes.length}`} tone="processing" />
            <StatusTag label={workspaceDetail?.dir ? 'workspace 已定位' : 'workspace 未定位'} tone="warning" />
            <StatusTag label={focusedConversation ? '聚焦态' : '概览态'} tone={focusedConversation ? 'success' : 'default'} />
          </Space>
          <Typography.Text type="secondary" className="conversation-canvas__meta-text">
            {focusedConversation ? '当前处于对话聚焦态；展示当前对话消息，并保留父子节点作为上下文锚点。' : '当前显示该 session 下的对话树，可右键空白创建根对话，右键节点创建子对话。'}
          </Typography.Text>
        </div>
      ) : null}

      <div className="conversation-canvas__controls" role="toolbar" aria-label="画布控制">
        <Button className="conversation-canvas__control-button" onClick={() => void reactFlow.zoomOut({ duration: 180 })} disabled={Boolean(focusedConversation)}>
          -
        </Button>
        <Button className="conversation-canvas__control-button" onClick={() => void reactFlow.zoomIn({ duration: 180 })} disabled={Boolean(focusedConversation)}>
          +
        </Button>
        <Button
          className="conversation-canvas__control-button"
          onClick={() => {
            if (focusedConversation) {
              setFocusedConversationId(null)
              return
            }

            void reactFlow.fitView({ padding: 0.2, duration: 240 })
          }}
        >
          {focusedConversation ? '返回' : '适配'}
        </Button>
      </div>

      <ReactFlow
        className="conversation-canvas__flow"
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        panOnDrag={!focusedConversation}
        zoomOnScroll={!focusedConversation}
        zoomOnPinch={!focusedConversation}
        zoomOnDoubleClick={!focusedConversation}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => setSelectedConversationId(node.id)}
        onPaneClick={() => {
          if (!focusedConversation) {
            setSelectedConversationId(null)
          }
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={32} size={1} color="var(--app-grid-color)" />
      </ReactFlow>

      {!conversationNodes.length ? (
        <div className="conversation-canvas__focused-empty-state">
          <EmptyState title="当前 session 暂无对话节点" description={sessionDetail ? '可右键空白处创建根对话，或在已有对话上右键创建子对话。' : '请先创建或切换到一个会话。'} />
        </div>
      ) : null}

      {focusedConversation ? (
        <div className="conversation-canvas__focused-panel">
          <Card size="small" className="conversation-node__card conversation-node__card--assistant">
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                <Space direction="vertical" size={4}>
                  <Typography.Text strong>{summarizeConversation(focusedConversation)}</Typography.Text>
                  <Typography.Text type="secondary">{focusedConversation.conversationId}</Typography.Text>
                </Space>
                <Space wrap>
                  <Button size="small" onClick={() => void onCreateConversation(focusedConversation.conversationId)}>
                    创建子对话
                  </Button>
                  <Button size="small" onClick={() => setFocusedConversationId(null)}>
                    退出聚焦态
                  </Button>
                </Space>
              </Space>

              <div className="conversation-canvas__focused-content">
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                    <Typography.Text strong>消息列表</Typography.Text>
                    <StatusTag
                      label={messagesLoading ? '加载中' : messagesError ? '加载失败' : `${conversationMessages.length} 条`}
                      tone={messagesError ? 'error' : messagesLoading ? 'processing' : 'default'}
                    />
                  </Space>

                  {messagesError ? <Typography.Text type="danger">{messagesError}</Typography.Text> : null}

                  {!messagesLoading && !messagesError && conversationMessages.length === 0 ? (
                    <Typography.Text type="secondary">当前对话暂无消息。</Typography.Text>
                  ) : null}

                  {!messagesError && conversationMessages.length ? (
                    <div className="conversation-canvas__focused-messages">
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        {conversationMessages.map((message) => (
                          <Card key={message.id} size="small" className="conversation-canvas__focused-message">
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                              <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                                <Typography.Text strong>{renderMessageRole(message.role)}</Typography.Text>
                                <Typography.Text type="secondary">{message.createdAt ?? ''}</Typography.Text>
                              </Space>
                              <Typography.Paragraph style={{ marginBottom: 0 }}>{message.content}</Typography.Paragraph>
                            </Space>
                          </Card>
                        ))}
                      </Space>
                    </div>
                  ) : null}

                  <div className="conversation-canvas__focused-composer">
                    <MessageComposer
                      workspaceId={conversationDetail?.workspaceId ?? null}
                      selectedConversationId={focusedConversation.conversationId}
                      selectedConversationLabel={summarizeConversation(focusedConversation)}
                      sending={sending}
                      onSend={onSendMessage}
                      onStop={onStopMessage}
                    />
                  </div>
                </Space>
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
                  <Typography.Text type="secondary">Selected Conversation</Typography.Text>
                </Space>
                <StatusTag label={sending ? '发送中' : selectedConversation || canCreateConversationOnSend ? '待发送' : '待选择目标'} tone={sending ? 'processing' : selectedConversation || canCreateConversationOnSend ? 'success' : 'default'} />
              </Space>
              <MessageComposer
                workspaceId={conversationDetail?.workspaceId ?? null}
                selectedConversationId={selectedConversation?.conversationId ?? null}
                selectedConversationLabel={selectedConversation ? summarizeConversation(selectedConversation) : null}
                sending={sending}
                allowCreateOnSend={canCreateConversationOnSend}
                onSend={onSendMessage}
                onStop={onStopMessage}
              />
            </Space>
          </Card>
        </div>
      </div>
    </div>
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
        <ContextMenuProvider>
          <FlowViewport {...props} />
          <ContextMenu onCreateConversation={props.onCreateConversation} />
        </ContextMenuProvider>
      </ReactFlowProvider>
    </section>
  )
}
