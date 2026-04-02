import { Background, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Card, Space, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ConversationDetail, ConversationNode, MessageNode, SessionDetail, SessionId, WorkspaceDetail } from '../../entities'
import { selectFocusedConversationId, useChatWorkbenchStore, useTreeStore } from '../../features'
import { frontendLogger } from '../../shared/logging/logger'
import { EmptyState, StatusTag } from '../../shared/ui'
import { ContextMenu, ContextMenuProvider, useContextMenu } from './ContextMenu'
import { MessageComposer } from './MessageComposer'

type ConversationCanvasProps = {
  currentSessionId: SessionId | null
  focusedConversationId: string | null
  selectedConversationId: string | null
  lockedSendConversationId: string | null
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
  onDeleteConversation: (conversationId: string) => Promise<void>
  onAutoArrange: () => Promise<void>
}

type FlowNodeData = {
  conversation: ConversationNode
  focused: boolean
  selected: boolean
  conversationMessages: MessageNode[]
  messagesLoading: boolean
  messagesError: string | null
  conversationError: string | null
  focusCardWidth?: number
  focusBodyHeight?: number
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

function stopEvent(event: React.SyntheticEvent) {
  event.stopPropagation()
}

function resolveConversationPosition(
  conversation: ConversationNode,
  overviewLayoutMap: Map<string, { x: number; y: number }>,
) {
  return conversation.position ?? overviewLayoutMap.get(conversation.conversationId) ?? { x: 0, y: 0 }
}

function OverviewNodePage({ conversation, focused, selected }: { conversation: ConversationNode; focused: boolean; selected: boolean }) {
  return (
    <Space direction="vertical" size={10} style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{summarizeConversation(conversation)}</Typography.Text>
          <Typography.Text type="secondary">{conversation.conversationId}</Typography.Text>
        </Space>
        <Space wrap onClick={stopEvent} onDoubleClick={stopEvent}>
          <StatusTag
            label={focused ? 'focused' : selected ? 'selected' : conversation.state}
            tone={focused ? 'warning' : selected ? 'processing' : 'default'}
          />
        </Space>
      </Space>

      <Space wrap>
        <StatusTag label={`${conversation.messageCount} 条消息`} tone="default" />
        {conversation.parentConversationId ? <StatusTag label={`父对话 ${conversation.parentConversationId}`} tone="default" /> : <StatusTag label="根对话" tone="success" />}
      </Space>
    </Space>
  )
}

function FocusNodePage({
  conversation,
  conversationMessages,
  messagesLoading,
  messagesError,
  conversationError,
}: {
  conversation: ConversationNode
  conversationMessages: MessageNode[]
  messagesLoading: boolean
  messagesError: string | null
  conversationError: string | null
}) {
  return (
    <div className="conversation-node__focused-body nodrag nopan" onClick={stopEvent} onDoubleClick={stopEvent}>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
          <Space direction="vertical" size={2}>
            <Typography.Text strong>{summarizeConversation(conversation)}</Typography.Text>
            <Typography.Text type="secondary">{conversation.conversationId}</Typography.Text>
          </Space>
          <Space wrap>
            <StatusTag label="focused" tone="warning" />
            <StatusTag label={`${conversation.messageCount} 条消息`} tone="default" />
            {conversation.parentConversationId ? <StatusTag label={`父对话 ${conversation.parentConversationId}`} tone="default" /> : <StatusTag label="根对话" tone="success" />}
          </Space>
        </Space>

        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Typography.Text strong>消息列表</Typography.Text>
          <StatusTag
            label={messagesLoading ? '加载中' : messagesError ? '加载失败' : `${conversationMessages.length} 条`}
            tone={messagesError ? 'error' : messagesLoading ? 'processing' : 'default'}
          />
        </Space>

        {conversationError ? <Typography.Text type="danger">{conversationError}</Typography.Text> : null}
        {messagesError ? <Typography.Text type="danger">{messagesError}</Typography.Text> : null}

        {!messagesLoading && !messagesError && conversationMessages.length === 0 ? <Typography.Text type="secondary">当前对话暂无消息。</Typography.Text> : null}

        {!messagesError && conversationMessages.length ? (
          <div className="conversation-node__messages">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {conversationMessages.map((message) => (
                <Card key={message.id} size="small" className="conversation-node__message-card">
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                      <Typography.Text strong>{renderMessageRole(message.role)}</Typography.Text>
                      <Typography.Text type="secondary">{message.createdAt ?? ''}</Typography.Text>
                    </Space>
                    <Typography.Paragraph className="conversation-node__message-text" style={{ marginBottom: 0 }}>
                      {message.content}
                      {message.status === 'streaming' && <span className="streaming-indicator">▊</span>}
                      {message.status === 'error' && <Typography.Text type="danger"> [消息发送失败]</Typography.Text>}
                    </Typography.Paragraph>
                  </Space>
                </Card>
              ))}
            </Space>
          </div>
        ) : null}
      </Space>
    </div>
  )
}

function FlowConversationNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const {
    conversation,
    focused,
    selected,
    conversationMessages = [],
    messagesLoading = false,
    messagesError = null,
    conversationError,
    focusCardWidth,
    focusBodyHeight,
  } = data

  return (
    <div
      className={focused ? 'conversation-node conversation-node--focused' : selected ? 'conversation-node conversation-node--selected' : 'conversation-node'}
      data-conversation-id={conversation.conversationId}
      aria-label={`查看对话 ${conversation.conversationId}`}
      style={focused && focusCardWidth ? { width: `${focusCardWidth}px` } : undefined}
    >
      <Handle type="target" position={Position.Top} className="conversation-node__handle" isConnectable={false} />
      <div className={focused ? 'conversation-node__focus-shell conversation-node__focus-shell--focused' : 'conversation-node__focus-shell'}>
        <div className={focused ? 'conversation-node__focus-content conversation-node__focus-content--focused' : 'conversation-node__focus-content'}>
          <Card
            size="small"
            className={focused ? 'conversation-node__card conversation-node__card--assistant conversation-node__card--focused' : 'conversation-node__card conversation-node__card--assistant'}
            styles={focused && focusBodyHeight ? { body: { height: `${focusBodyHeight}px` } } : undefined}
          >
            <div className={focused ? 'conversation-node__body-frame conversation-node__body-frame--focused' : 'conversation-node__body-frame'}>
              <div className="conversation-node__page-shell">
                {!focused ? <OverviewNodePage conversation={conversation} focused={focused} selected={selected} /> : (
                  <FocusNodePage
                    conversation={conversation}
                    conversationMessages={conversationMessages}
                    messagesLoading={messagesLoading}
                    messagesError={messagesError}
                    conversationError={conversationError}
                  />
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="conversation-node__handle" isConnectable={false} />
    </div>
  )
}

const nodeTypes = {
  conversation: FlowConversationNode,
} as const

function FlowViewport({
  currentSessionId,
  focusedConversationId,
  lockedSendConversationId,
  sessionDetail,
  conversationDetail,
  conversationNodes,
  conversationMessages,
  messagesLoading,
  messagesError,
  sending,
  canCreateConversationOnSend,
  onSendMessage,
  onStopMessage,
}: ConversationCanvasProps) {
  const reactFlow = useReactFlow<Node<FlowNodeData>, Edge>()
  const setFocusedConversationId = useTreeStore((state) => state.setFocusedConversationId)
  const updateConversationNodePosition = useChatWorkbenchStore((state) => state.updateConversationNodePosition)
  const persistConversationPositions = useChatWorkbenchStore((state) => state.persistConversationPositions)
  const storeFocusedConversationId = useTreeStore(selectFocusedConversationId)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLDivElement | null>(null)

  const selectedConversation = useMemo(
    () => conversationNodes.find((conversation) => conversation.conversationId === lockedSendConversationId) ?? null,
    [conversationNodes, lockedSendConversationId],
  )
  const focusedConversation = useMemo(
    () => conversationNodes.find((conversation) => conversation.conversationId === focusedConversationId) ?? null,
    [conversationNodes, focusedConversationId],
  )

  const overviewLayoutMap = useMemo(() => buildTreeLayout(conversationNodes), [conversationNodes])

  const focusMetrics = useMemo(() => {
    if (!focusedConversation) {
      return { cardWidth: 320, bodyHeight: 220, centerYOffset: 0, visualWidth: 320, visualHeight: 220 }
    }

    const viewportWidth = viewportRef.current?.clientWidth ?? window.innerWidth
    const viewportHeight = viewportRef.current?.clientHeight ?? window.innerHeight
    const composerHeight = composerRef.current?.clientHeight ?? 0
    const topInset = 72
    const sideInset = 28
    const bottomInset = 20
    const availableWidth = Math.max(280, viewportWidth - sideInset * 2)
    const availableHeight = Math.max(220, viewportHeight - composerHeight - topInset - bottomInset)
    const targetRatio = availableWidth / availableHeight
    const baseWidth = 320
    const cardWidth = Math.max(240, Math.min(availableWidth, baseWidth * targetRatio))
    const bodyHeight = Math.max(220, Math.min(availableHeight, cardWidth * (availableHeight / availableWidth)))
    const visualHeight = bodyHeight
    const viewportTop = viewportRef.current?.getBoundingClientRect().top ?? 0
    const composerTop = composerRef.current?.getBoundingClientRect().top ?? viewportTop + viewportHeight - composerHeight - 24
    const composerTopInViewport = composerTop - viewportTop
    const centerYOffset = (composerTopInViewport - viewportHeight) / 2

    return {
      cardWidth,
      bodyHeight,
      centerYOffset,
      visualWidth: cardWidth,
      visualHeight,
    }
  }, [conversationMessages.length, focusedConversation])

  const flowNodes = useMemo<Array<Node<FlowNodeData>>>(() => {
    return conversationNodes.map((conversation) => {
      const focused = storeFocusedConversationId === conversation.conversationId
      const faded = storeFocusedConversationId !== null && storeFocusedConversationId !== conversation.conversationId
      return {
        id: conversation.conversationId,
        type: 'conversation',
        position: resolveConversationPosition(conversation, overviewLayoutMap),
        origin: [0.5, 0.5],
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          conversation,
          focused,
          selected: lockedSendConversationId === conversation.conversationId,
          conversationMessages: focused ? conversationMessages : [],
          messagesLoading: focused ? messagesLoading : false,
          messagesError: focused ? messagesError : null,
          conversationError: focused ? conversationDetail?.error ?? null : null,
          focusCardWidth: focused ? focusMetrics.cardWidth : undefined,
          focusBodyHeight: focused ? focusMetrics.bodyHeight : undefined,
        },
        className: [
          'conversation-flow-node',
          focused ? 'conversation-flow-node--focused' : null,
          faded ? 'conversation-flow-node--dimmed' : null,
        ].filter(Boolean).join(' '),
        draggable: !focused,
      }
    })
  }, [
    conversationNodes,
    conversationDetail?.error,
    focusMetrics.bodyHeight,
    focusMetrics.cardWidth,
    conversationMessages,
    messagesError,
    messagesLoading,
    overviewLayoutMap,
    lockedSendConversationId,
    storeFocusedConversationId,
  ])

  const flowEdges = useMemo<Edge[]>(() => {
    return conversationNodes
      .filter((conversation) => conversation.parentConversationId)
      .filter((conversation) => conversationNodes.some((item) => item.conversationId === conversation.parentConversationId))
      .map((conversation) => ({
        id: `${conversation.parentConversationId}-${conversation.conversationId}`,
        source: conversation.parentConversationId as string,
        target: conversation.conversationId,
        type: 'smoothstep',
        animated: lockedSendConversationId === conversation.conversationId || focusedConversationId === conversation.conversationId,
        style: {
          strokeWidth: lockedSendConversationId === conversation.conversationId || focusedConversationId === conversation.conversationId ? 2.5 : 2,
          stroke: lockedSendConversationId === conversation.conversationId || focusedConversationId === conversation.conversationId
            ? 'rgba(96, 165, 250, 0.95)'
            : 'rgba(148, 163, 184, 0.72)',
        },
      }))
  }, [conversationNodes, focusedConversationId, lockedSendConversationId])

  useEffect(() => {
    if (!flowNodes.length) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      if (focusedConversation) {
        const position = resolveConversationPosition(focusedConversation, overviewLayoutMap)
        const nodeWidth = focusMetrics.visualWidth
        const nodeHeight = focusMetrics.visualHeight
        const viewportWidth = viewportRef.current?.clientWidth ?? window.innerWidth
        const viewportHeight = viewportRef.current?.clientHeight ?? window.innerHeight
        const composerHeight = composerRef.current?.clientHeight ?? 0
        const topInset = 72
        const sideInset = 28
        const bottomInset = 20
        const availableWidth = Math.max(240, viewportWidth - sideInset * 2)
        const availableHeight = Math.max(220, viewportHeight - composerHeight - topInset - bottomInset)
        const zoom = Math.max(1.18, Math.min(2.8, Math.min(availableWidth / nodeWidth, availableHeight / nodeHeight) * 1.08))
        const centerX = position.x
        const centerY = position.y - focusMetrics.centerYOffset / zoom
        void reactFlow.setCenter(centerX, centerY, {
          zoom,
          duration: 420,
          ease: (value) => 1 - Math.pow(1 - value, 3),
        })
        return
      }

      void reactFlow.fitView({
        padding: 0.2,
        duration: 360,
        ease: (value) => 1 - Math.pow(1 - value, 3),
        includeHiddenNodes: true,
      })
    }, 50)

    return () => window.clearTimeout(timeoutId)
  }, [flowNodes, focusedConversation, overviewLayoutMap, reactFlow, focusMetrics])

  const { setContextMenu } = useContextMenu()

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()

      const target = event.target as HTMLElement
      const nodeElement = target.closest('[data-conversation-id]')

      if (nodeElement) {
        const conversationId = nodeElement.getAttribute('data-conversation-id')
        if (!conversationId) {
          return
        }

        setContextMenu({
          type: 'node',
          conversationId,
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
    <div className="conversation-canvas__viewport" onContextMenu={handleContextMenu} ref={viewportRef}>
      {focusedConversation ? (
        <div className="conversation-canvas__controls" role="toolbar" aria-label="聚焦控制">
          <button
            type="button"
            className="conversation-canvas__exit-focus-button"
            onClick={() => setFocusedConversationId(null)}
          >
            退出聚焦
          </button>
        </div>
      ) : null}

      <ReactFlow
        className={focusedConversation ? 'conversation-canvas__flow conversation-canvas__flow--focused' : 'conversation-canvas__flow'}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={!focusedConversation}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeDoubleClick={(_, node) => {
          setFocusedConversationId(node.id)
        }}
        onNodeDrag={(_, node) => {
          if (focusedConversation) {
            return
          }

          updateConversationNodePosition(node.id, { x: node.position.x, y: node.position.y })
        }}
        onNodeDragStop={(_, node) => {
          if (!currentSessionId || focusedConversation) {
            return
          }

          const position = { x: node.position.x, y: node.position.y }
          updateConversationNodePosition(node.id, position)
          frontendLogger.info('move_conversation_node', {
            extra: {
              conversation_id: node.id,
              session_id: currentSessionId,
              x: position.x,
              y: position.y,
            },
          })
          void persistConversationPositions(currentSessionId, [{ conversationId: node.id, position }])
        }}
        onPaneClick={() => {
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

      <div className={focusedConversation ? 'conversation-canvas__composer-shell conversation-canvas__composer-shell--focused' : 'conversation-canvas__composer-shell'} ref={composerRef}>
        <div className={focusedConversation ? 'conversation-node conversation-node--composer conversation-node--composer-focused' : 'conversation-node conversation-node--composer'}>
          <Card size="small" className="conversation-node__card conversation-node__card--composer">
            <MessageComposer
              selectedConversationId={selectedConversation?.conversationId ?? null}
              selectedConversationLabel={selectedConversation ? summarizeConversation(selectedConversation) : null}
              sending={sending}
              allowCreateOnSend={canCreateConversationOnSend}
              onSend={onSendMessage}
              onStop={onStopMessage}
            />
          </Card>
        </div>
      </div>
    </div>
  )
}

export function ConversationCanvas(props: ConversationCanvasProps) {
  const lockedSendConversationId = useTreeStore((state) => state.lockedSendConversationId)
  const setLockedSendConversationId = useTreeStore((state) => state.setLockedSendConversationId)

  return (
    <section className="conversation-canvas">
      <div className="conversation-canvas__backdrop" aria-hidden="true">
        <div className="conversation-canvas__glow conversation-canvas__glow--primary" />
        <div className="conversation-canvas__glow conversation-canvas__glow--secondary" />
      </div>

      <ReactFlowProvider>
        <ContextMenuProvider>
          <FlowViewport {...props} />
          <ContextMenu
            onSelectConversation={(conversationId) => {
              frontendLogger.info('switch_conversation', {
                extra: {
                  conversation_id: conversationId,
                  previous_conversation_id: lockedSendConversationId,
                  trigger: 'context_menu_action',
                },
              })
              setLockedSendConversationId(conversationId)
            }}
            onCreateConversation={props.onCreateConversation}
            onDeleteConversation={props.onDeleteConversation}
            onAutoArrange={props.onAutoArrange}
          />
        </ContextMenuProvider>
      </ReactFlowProvider>
    </section>
  )
}
