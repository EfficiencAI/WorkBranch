import { Background, Handle, Position, ReactFlow, ReactFlowProvider, useOnViewportChange, useReactFlow } from '@xyflow/react'
import type { Edge, Node, NodeProps, Viewport } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button, Card, Space, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSettings } from '../../app/settings'
import type { ConversationDetail, ConversationNode, MessageNode, SessionDetail, SessionId } from '../../entities'
import { selectFocusedConversationId, selectHalfPreviewConversationId, useChatWorkbenchStore, useTreeStore } from '../../features'
import { frontendLogger } from '../../shared/logging/logger'
import { EmptyState, StatusTag } from '../../shared/ui'
import { ContextMenu, ContextMenuProvider, useContextMenu } from './ContextMenu'
import { MessageComposer } from './MessageComposer'
import { MessageRenderer } from '../../components/messages'

type ConversationCanvasProps = {
  currentSessionId: SessionId | null
  focusedConversationId: string | null
  halfPreviewConversationId: string | null
  selectedConversationId: string | null
  lockedSendConversationId: string | null
  sessionDetail: SessionDetail | null
  conversationDetail: ConversationDetail | null
  conversationNodes: ConversationNode[]
  conversationMessages: MessageNode[]
  messagesLoading: boolean
  messagesError: string | null
  sending: boolean
  canCreateConversationOnSend: boolean
  onSendMessage: (message: string, enableContext: boolean) => Promise<void>
  onStopMessage: () => Promise<void>
  onCreateConversation: (parentConversationId: string | null) => Promise<void>
  onDeleteConversation: (conversationId: string) => Promise<void>
  onAutoArrange: () => Promise<void>
}

type FlowNodeData = {
  conversation: ConversationNode
  focused: boolean
  halfPreview: boolean
  selected: boolean
  interactionGateActive: boolean
  conversationMessages: MessageNode[]
  messagesLoading: boolean
  messagesError: string | null
  conversationError: string | null
  focusCardWidth?: number
  focusBodyHeight?: number
  previewCardWidth?: number
  previewBodyHeight?: number
}

const DEFAULT_HALF_PREVIEW_INTERACTION_DELAY = 300
const DIAGRAM_POINTER_TOLERANCE_PX = 4

function summarizeConversation(conversation: ConversationNode) {
  if (conversation.title?.trim()) {
    return conversation.title.trim()
  }

  if (conversation.messageCount > 0) {
    return `未命名对话 · ${conversation.messageCount} 条消息`
  }

  return '空对话'
}

function stopEvent(event: React.SyntheticEvent) {
  event.stopPropagation()
}

function stopWheelEvent(event: React.WheelEvent) {
  event.stopPropagation()
  const nativeEvent = event.nativeEvent
  if (nativeEvent && typeof nativeEvent.stopImmediatePropagation === 'function') {
    nativeEvent.stopImmediatePropagation()
  }
}

function resolveConversationPosition(
  conversation: ConversationNode,
  overviewLayoutMap: Map<string, { x: number; y: number }>,
) {
  return conversation.position ?? overviewLayoutMap.get(conversation.conversationId) ?? { x: 0, y: 0 }
}

function renderMessageList(
  conversationMessages: MessageNode[],
  messagesLoading: boolean,
  messagesError: string | null,
  conversationError: string | null,
  messagesClassName = 'conversation-node__messages',
) {
  return (
    <>
      {conversationError ? <Typography.Text type="danger">{conversationError}</Typography.Text> : null}
      {messagesError ? <Typography.Text type="danger">{messagesError}</Typography.Text> : null}

      {!messagesLoading && !messagesError && conversationMessages.length === 0 ? <Typography.Text type="secondary">当前对话暂无消息。</Typography.Text> : null}

      {!messagesError && conversationMessages.length ? (
        <div className={messagesClassName} onWheelCapture={stopWheelEvent}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {conversationMessages.map((message) => (
              <Space direction="vertical" size={8} key={message.id} style={{ width: '100%' }}>
                {message.userContent ? (
                  <Card size="small" className="conversation-node__message-card conversation-node__message-card--user">
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Typography.Text strong>用户</Typography.Text>
                        <Typography.Text type="secondary">{message.createdAt ?? ''}</Typography.Text>
                      </Space>
                      <Typography.Paragraph className="conversation-node__message-text" style={{ marginBottom: 0 }}>
                        {message.userContent}
                      </Typography.Paragraph>
                    </Space>
                  </Card>
                ) : null}
                {message.assistantContent || message.status === 'streaming' ? (
                  <Card size="small" className="conversation-node__message-card conversation-node__message-card--assistant">
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Typography.Text strong>助手</Typography.Text>
                        <Typography.Text type="secondary">{message.updatedAt ?? message.createdAt ?? ''}</Typography.Text>
                      </Space>
                      <Typography.Paragraph className="conversation-node__message-text" style={{ marginBottom: 0 }}>
                        <MessageRenderer content={message.assistantContent} messageId={message.id} />
                        {message.status === 'streaming' && <span className="streaming-indicator">▊</span>}
                        {message.status === 'error' && <Typography.Text type="danger"> [消息发送失败]</Typography.Text>}
                      </Typography.Paragraph>
                    </Space>
                  </Card>
                ) : null}
              </Space>
            ))}
          </Space>
        </div>
      ) : null}
    </>
  )
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

function HalfPreviewNodePage({
  conversation,
  interactionGateActive,
  conversationMessages,
  messagesLoading,
  messagesError,
  conversationError,
}: {
  conversation: ConversationNode
  interactionGateActive: boolean
  conversationMessages: MessageNode[]
  messagesLoading: boolean
  messagesError: string | null
  conversationError: string | null
}) {
  return (
    <FocusNodePage
      conversation={conversation}
      conversationMessages={conversationMessages}
      messagesLoading={messagesLoading}
      messagesError={messagesError}
      conversationError={conversationError}
      interactive={!interactionGateActive}
    />
  )
}

function FocusNodePage({
  conversation,
  conversationMessages,
  messagesLoading,
  messagesError,
  conversationError,
  interactive = true,
}: {
  conversation: ConversationNode
  conversationMessages: MessageNode[]
  messagesLoading: boolean
  messagesError: string | null
  conversationError: string | null
  interactive?: boolean
}) {
  return (
    <div className="conversation-node__focused-body nodrag nopan" onClick={interactive ? stopEvent : undefined} onDoubleClick={interactive ? stopEvent : undefined}>
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

        {renderMessageList(conversationMessages, messagesLoading, messagesError, conversationError)}
      </Space>
    </div>
  )
}

function FlowConversationNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const {
    conversation,
    focused,
    halfPreview,
    selected,
    interactionGateActive,
    conversationMessages = [],
    messagesLoading = false,
    messagesError = null,
    conversationError,
    focusCardWidth,
    focusBodyHeight,
    previewCardWidth,
    previewBodyHeight,
  } = data

  const width = focused ? focusCardWidth : halfPreview ? previewCardWidth : undefined
  const bodyHeight = focused ? focusBodyHeight : halfPreview ? previewBodyHeight : undefined
  const nodeClassName = [
    'conversation-node',
    focused ? 'conversation-node--focused' : null,
    halfPreview ? 'conversation-node--half-preview' : null,
    selected && !focused && !halfPreview ? 'conversation-node--selected' : null,
    interactionGateActive ? 'conversation-node--interaction-gated' : null,
  ].filter(Boolean).join(' ')
  const focusShellClassName = [
    'conversation-node__focus-shell',
    focused ? 'conversation-node__focus-shell--focused' : null,
    halfPreview ? 'conversation-node__focus-shell--half-preview' : null,
  ].filter(Boolean).join(' ')
  const focusContentClassName = [
    'conversation-node__focus-content',
    focused ? 'conversation-node__focus-content--focused' : null,
    halfPreview ? 'conversation-node__focus-content--half-preview' : null,
  ].filter(Boolean).join(' ')
  const cardClassName = [
    'conversation-node__card',
    'conversation-node__card--assistant',
    focused ? 'conversation-node__card--focused' : null,
    halfPreview ? 'conversation-node__card--half-preview' : null,
  ].filter(Boolean).join(' ')
  const bodyFrameClassName = [
    'conversation-node__body-frame',
    focused ? 'conversation-node__body-frame--focused' : null,
    halfPreview ? 'conversation-node__body-frame--half-preview' : null,
  ].filter(Boolean).join(' ')

  return (
    <div
      className={nodeClassName}
      data-conversation-id={conversation.conversationId}
      aria-label={`查看对话 ${conversation.conversationId}`}
      style={width ? { width: `${width}px` } : undefined}
    >
      <Handle type="target" position={Position.Top} className="conversation-node__handle" isConnectable={false} />
      <div className={focusShellClassName}>
        <div className={focusContentClassName}>
          <Card
            size="small"
            className={cardClassName}
            styles={bodyHeight ? { body: { height: `${bodyHeight}px` } } : undefined}
          >
            <div className={bodyFrameClassName}>
              <div className="conversation-node__page-shell">
                {focused ? (
                  <FocusNodePage
                    conversation={conversation}
                    conversationMessages={conversationMessages}
                    messagesLoading={messagesLoading}
                    messagesError={messagesError}
                    conversationError={conversationError}
                  />
                ) : halfPreview ? (
                  <div
                    className={interactionGateActive ? 'conversation-node__half-preview-shell conversation-node__half-preview-shell--gated' : 'conversation-node__half-preview-shell'}
                  >
                    <HalfPreviewNodePage
                      conversation={conversation}
                      interactionGateActive={interactionGateActive}
                      conversationMessages={conversationMessages}
                      messagesLoading={messagesLoading}
                      messagesError={messagesError}
                      conversationError={conversationError}
                    />
                  </div>
                ) : (
                  <OverviewNodePage conversation={conversation} focused={focused} selected={selected} />
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

const NODE_WIDTH = 320
const MIN_HORIZONTAL_GAP = 60
const VERTICAL_GAP = 240

export function buildTreeLayout(conversationNodes: ConversationNode[]) {
  if (conversationNodes.length === 0) {
    return new Map<string, { x: number; y: number }>()
  }

  const childMap = new Map<string | null, ConversationNode[]>()
  const nodeDepth = new Map<string, number>()
  const subtreeWidth = new Map<string, number>()

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

  let maxDepth = 0
  const queue: Array<{ id: string; depth: number }> = []
  const roots = childMap.get(null) ?? []
  for (const root of roots) {
    queue.push({ id: root.conversationId, depth: 0 })
  }

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    nodeDepth.set(id, depth)
    maxDepth = Math.max(maxDepth, depth)
    const children = childMap.get(id) ?? []
    for (const child of children) {
      queue.push({ id: child.conversationId, depth: depth + 1 })
    }
  }

  for (const conversation of conversationNodes) {
    if (!nodeDepth.has(conversation.conversationId)) {
      nodeDepth.set(conversation.conversationId, maxDepth + 1)
      maxDepth = Math.max(maxDepth, maxDepth + 1)
    }
  }

  for (let depth = maxDepth; depth >= 0; depth--) {
    const nodesAtDepth = conversationNodes.filter((n) => nodeDepth.get(n.conversationId) === depth)
    for (const node of nodesAtDepth) {
      const children = childMap.get(node.conversationId) ?? []
      if (children.length === 0) {
        subtreeWidth.set(node.conversationId, NODE_WIDTH)
      } else {
        let totalWidth = 0
        for (const child of children) {
          totalWidth += subtreeWidth.get(child.conversationId) ?? NODE_WIDTH
        }
        totalWidth += (children.length - 1) * MIN_HORIZONTAL_GAP
        subtreeWidth.set(node.conversationId, totalWidth)
      }
    }
  }

  const positions = new Map<string, { x: number; y: number }>()

  function layoutNode(nodeId: string, x: number, depth: number) {
    positions.set(nodeId, { x, y: depth * VERTICAL_GAP })

    const children = childMap.get(nodeId) ?? []
    if (children.length === 0) return

    let currentX = x - (subtreeWidth.get(nodeId) ?? NODE_WIDTH) / 2
    for (const child of children) {
      const childWidth = subtreeWidth.get(child.conversationId) ?? NODE_WIDTH
      const childX = currentX + childWidth / 2
      layoutNode(child.conversationId, childX, depth + 1)
      currentX += childWidth + MIN_HORIZONTAL_GAP
    }
  }

  const sortedRoots = roots.sort(
    (left, right) =>
      (left.createdAt ?? '').localeCompare(right.createdAt ?? '') || left.conversationId.localeCompare(right.conversationId),
  )

  let currentRootX = 0
  for (const root of sortedRoots) {
    const rootWidth = subtreeWidth.get(root.conversationId) ?? NODE_WIDTH
    const rootX = currentRootX + rootWidth / 2
    layoutNode(root.conversationId, rootX, 0)
    currentRootX += rootWidth + MIN_HORIZONTAL_GAP
  }

  let minX = Infinity
  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x - NODE_WIDTH / 2)
  }

  if (minX < 0) {
    const offsetX = -minX
    for (const [id, pos] of positions) {
      positions.set(id, { x: pos.x + offsetX, y: pos.y })
    }
  }

  return positions
}

function FlowViewport({
  currentSessionId,
  focusedConversationId,
  halfPreviewConversationId,
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
  onCreateConversation,
}: ConversationCanvasProps) {
  const { settings } = useSettings()
  const reactFlow = useReactFlow<Node<FlowNodeData>, Edge>()
  const halfPreviewInteractionDelay =
    settings?.ui &&
    typeof settings.ui === 'object' &&
    'diagram_double_click_delay_ms' in settings.ui &&
    typeof settings.ui.diagram_double_click_delay_ms === 'number'
      ? settings.ui.diagram_double_click_delay_ms
      : DEFAULT_HALF_PREVIEW_INTERACTION_DELAY
  const setFocusedConversationId = useTreeStore((state) => state.setFocusedConversationId)
  const setHalfPreviewConversationId = useTreeStore((state) => state.setHalfPreviewConversationId)
  const clearHalfPreviewConversationId = useTreeStore((state) => state.clearHalfPreviewConversationId)
  const setLockedSendConversationId = useTreeStore((state) => state.setLockedSendConversationId)
  const updateConversationNodePosition = useChatWorkbenchStore((state) => state.updateConversationNodePosition)
  const persistConversationPositions = useChatWorkbenchStore((state) => state.persistConversationPositions)
  const storeFocusedConversationId = useTreeStore(selectFocusedConversationId)
  const storeHalfPreviewConversationId = useTreeStore(selectHalfPreviewConversationId)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const interactionGateTimerRef = useRef<number | null>(null)
  const [interactionGateConversationId, setInteractionGateConversationId] = useState<string | null>(null)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [refreshMaskVisible, setRefreshMaskVisible] = useState(false)
  const lastZoomRef = useRef<number>(1)
  const isRefreshingRef = useRef(false)
  const zoomDebounceTimerRef = useRef<number | null>(null)

  const selectedConversation = useMemo(
    () => conversationNodes.find((conversation) => conversation.conversationId === lockedSendConversationId) ?? null,
    [conversationNodes, lockedSendConversationId],
  )
  const focusedConversation = useMemo(
    () => conversationNodes.find((conversation) => conversation.conversationId === focusedConversationId) ?? null,
    [conversationNodes, focusedConversationId],
  )
  const halfPreviewConversation = useMemo(
    () => conversationNodes.find((conversation) => conversation.conversationId === halfPreviewConversationId) ?? null,
    [conversationNodes, halfPreviewConversationId],
  )

  const overviewLayoutMap = useMemo(() => buildTreeLayout(conversationNodes), [conversationNodes])

  const clearInteractionGate = useCallback(() => {
    if (interactionGateTimerRef.current !== null) {
      window.clearTimeout(interactionGateTimerRef.current)
      interactionGateTimerRef.current = null
    }
    setInteractionGateConversationId(null)
  }, [])

  const startInteractionGate = useCallback((conversationId: string) => {
    if (interactionGateTimerRef.current !== null) {
      window.clearTimeout(interactionGateTimerRef.current)
    }

    setInteractionGateConversationId(conversationId)
    interactionGateTimerRef.current = window.setTimeout(() => {
      setHalfPreviewConversationId(conversationId)
      setInteractionGateConversationId(null)
      interactionGateTimerRef.current = null
    }, halfPreviewInteractionDelay)
  }, [halfPreviewInteractionDelay, setHalfPreviewConversationId])

  useEffect(() => {
    return () => {
      if (interactionGateTimerRef.current !== null) {
        window.clearTimeout(interactionGateTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const focusMetrics = useMemo(() => {
    if (!focusedConversation) {
      return { cardWidth: 320, bodyHeight: 220, centerYOffset: 0, visualWidth: 320, visualHeight: 220 }
    }

    const focusZoom = 0.82
    const viewportPixelWidth = viewportRef.current?.clientWidth ?? window.innerWidth
    const viewportPixelHeight = viewportRef.current?.clientHeight ?? window.innerHeight
    const composerHeight = composerRef.current?.clientHeight ?? 0
    const graphViewportWidth = viewportPixelWidth / focusZoom
    const graphViewportHeight = Math.max(220, (viewportPixelHeight - composerHeight) / focusZoom)
    const cardWidth = graphViewportWidth * 0.95
    const bodyHeight = cardWidth * (graphViewportHeight / graphViewportWidth) * 0.9

    return {
      cardWidth,
      bodyHeight,
      centerYOffset: 0,
      visualWidth: cardWidth,
      visualHeight: bodyHeight,
    }
  }, [focusedConversation, viewportWidth])

  const previewMetrics = useMemo(() => {
    const baseWidth = viewportWidth <= 640 ? 280 : 320
    const cardWidth = baseWidth
    const bodyHeight = cardWidth * 2

    return {
      cardWidth,
      bodyHeight,
    }
  }, [viewportWidth])

  const flowNodes = useMemo<Array<Node<FlowNodeData>>>(() => {
    return conversationNodes.map((conversation) => {
      const focused = storeFocusedConversationId === conversation.conversationId
      const halfPreview = storeHalfPreviewConversationId === conversation.conversationId
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
          halfPreview,
          selected: lockedSendConversationId === conversation.conversationId,
          interactionGateActive: interactionGateConversationId === conversation.conversationId,
          conversationMessages: focused || halfPreview ? conversationMessages : [],
          messagesLoading: focused || halfPreview ? messagesLoading : false,
          messagesError: focused || halfPreview ? messagesError : null,
          conversationError: focused || halfPreview ? conversationDetail?.error ?? null : null,
          focusCardWidth: focused ? focusMetrics.cardWidth : undefined,
          focusBodyHeight: focused ? focusMetrics.bodyHeight : undefined,
          previewCardWidth: halfPreview ? previewMetrics.cardWidth : undefined,
          previewBodyHeight: halfPreview ? previewMetrics.bodyHeight : undefined,
        },
        className: [
          'conversation-flow-node',
          focused ? 'conversation-flow-node--focused' : null,
          halfPreview ? 'conversation-flow-node--half-preview' : null,
          faded ? 'conversation-flow-node--dimmed' : null,
        ].filter(Boolean).join(' '),
        draggable: !focused && !halfPreview,
      }
    })
  }, [
    conversationNodes,
    conversationDetail?.error,
    focusMetrics.bodyHeight,
    focusMetrics.cardWidth,
    conversationMessages,
    interactionGateConversationId,
    lockedSendConversationId,
    messagesError,
    messagesLoading,
    overviewLayoutMap,
    previewMetrics.bodyHeight,
    previewMetrics.cardWidth,
    storeFocusedConversationId,
    storeHalfPreviewConversationId,
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
        animated:
          lockedSendConversationId === conversation.conversationId ||
          focusedConversationId === conversation.conversationId ||
          halfPreviewConversationId === conversation.conversationId,
        style: {
          strokeWidth:
            lockedSendConversationId === conversation.conversationId ||
            focusedConversationId === conversation.conversationId ||
            halfPreviewConversationId === conversation.conversationId
              ? 2.5
              : 2,
          stroke:
            lockedSendConversationId === conversation.conversationId ||
            focusedConversationId === conversation.conversationId ||
            halfPreviewConversationId === conversation.conversationId
              ? 'rgba(96, 165, 250, 0.95)'
              : 'rgba(148, 163, 184, 0.72)',
        },
      }))
  }, [conversationNodes, focusedConversationId, halfPreviewConversationId, lockedSendConversationId])

  useEffect(() => {
    if (!flowNodes.length || !focusedConversation) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const position = resolveConversationPosition(focusedConversation, overviewLayoutMap)
      const focusZoom = 0.82
      const composerHeight = composerRef.current?.clientHeight ?? 0
      const centerX = position.x
      const centerY = position.y + (composerHeight / focusZoom) / 4
      void reactFlow.setCenter(centerX, centerY, {
        zoom: focusZoom,
        duration: 420,
        ease: (value) => 1 - Math.pow(1 - value, 3),
      })
    }, 50)

    return () => window.clearTimeout(timeoutId)
  }, [flowNodes, focusedConversation, overviewLayoutMap, reactFlow, focusMetrics])

  useEffect(() => {
    if (!focusedConversation && !halfPreviewConversation) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      if (focusedConversation) {
        setFocusedConversationId(null)
        return
      }

      clearHalfPreviewConversationId()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearHalfPreviewConversationId, focusedConversation, halfPreviewConversation, setFocusedConversationId])

  const handleForceRefresh = useCallback(() => {
    if (isRefreshingRef.current) {
      return
    }

    isRefreshingRef.current = true
    setRefreshMaskVisible(true)

    window.requestAnimationFrame(() => {
      setRefreshMaskVisible(false)
      isRefreshingRef.current = false
    })
  }, [])

  useOnViewportChange({
    onChange: (viewport: Viewport) => {
      if (Math.abs(viewport.zoom - lastZoomRef.current) > 0.01) {
        lastZoomRef.current = viewport.zoom
        if (zoomDebounceTimerRef.current !== null) {
          window.clearTimeout(zoomDebounceTimerRef.current)
        }
        zoomDebounceTimerRef.current = window.setTimeout(() => {
          handleForceRefresh()
          zoomDebounceTimerRef.current = null
        }, 100)
      }
    },
  })

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



  const viewportClassName = [
    'conversation-canvas__viewport',
    refreshMaskVisible ? 'conversation-canvas__viewport--refreshing' : null,
  ].filter(Boolean).join(' ')

  return (
    <div className={viewportClassName} onContextMenu={handleContextMenu} ref={viewportRef}>
      {focusedConversation ? (
        <div className="conversation-canvas__controls" role="toolbar" aria-label="画布控制">
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
        nodesDraggable={!focusedConversation && !halfPreviewConversation}
        panOnDrag={!focusedConversation}
        zoomOnScroll={!focusedConversation}
        zoomOnPinch={!focusedConversation}
        zoomOnDoubleClick={false}
        nodesConnectable={false}
        elementsSelectable
        nodeDragThreshold={DIAGRAM_POINTER_TOLERANCE_PX}
        nodeClickDistance={DIAGRAM_POINTER_TOLERANCE_PX}
        paneClickDistance={DIAGRAM_POINTER_TOLERANCE_PX}
        onNodeClick={(_, node) => {
          if (focusedConversationId === node.id) {
            return
          }

          if (interactionGateConversationId === node.id) {
            clearInteractionGate()
            setFocusedConversationId(node.id)
            return
          }

          if (halfPreviewConversationId === node.id) {
            return
          }

          clearHalfPreviewConversationId()
          startInteractionGate(node.id)
        }}
        onNodeDoubleClick={(_, node) => {
          clearInteractionGate()
          setHalfPreviewConversationId(null)
          setFocusedConversationId(node.id)
        }}
        onNodeDrag={(_, node) => {
          if (focusedConversation || halfPreviewConversation) {
            return
          }

          updateConversationNodePosition(node.id, { x: node.position.x, y: node.position.y })
        }}
        onNodeDragStop={(_, node) => {
          if (!currentSessionId || focusedConversation || halfPreviewConversation) {
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
          clearInteractionGate()
          if (halfPreviewConversation) {
            clearHalfPreviewConversationId()
          }
          // Close context menu when clicking on pane
          setContextMenu(null)
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={32} size={1} color="var(--app-grid-color)" />
      </ReactFlow>

      {!conversationNodes.length ? (
        <div className="conversation-canvas__focused-empty-state">
          <EmptyState
            title="当前 session 暂无对话节点"
            description={sessionDetail ? '可右键空白处创建根对话，或在已有对话上右键创建子对话。' : '请先创建或切换到一个会话。'}
            action={
              sessionDetail ? (
                <Button onClick={() => void onCreateConversation(null)}>
                  创建第一个对话节点
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : null}

      <div className={focusedConversation ? 'conversation-canvas__composer-shell conversation-canvas__composer-shell--focused' : 'conversation-canvas__composer-shell'} ref={composerRef}>
        <div className={focusedConversation ? 'conversation-node conversation-node--composer conversation-node--composer-focused' : 'conversation-node conversation-node--composer'}>
          <Card size="small" className="conversation-node__card conversation-node__card--composer">
            <MessageComposer
              selectedConversationId={selectedConversation?.conversationId ?? null}
              selectedConversationLabel={selectedConversation ? summarizeConversation(selectedConversation) : null}
              focusedConversationId={focusedConversation?.conversationId ?? null}
              focusedConversationLabel={focusedConversation ? summarizeConversation(focusedConversation) : null}
              sending={sending}
              allowCreateOnSend={canCreateConversationOnSend}
              onSend={onSendMessage}
              onStop={onStopMessage}
              onSwitchToSendTarget={setLockedSendConversationId}
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
