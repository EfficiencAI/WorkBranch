import { Background, Handle, Position, ReactFlow, ReactFlowProvider, useOnViewportChange, useReactFlow } from '@xyflow/react'
import type { Edge, Node, NodeProps, Viewport } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button, Card, Space, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSettings } from '../../app/settings'
import type { ConversationDetail, ConversationNode, MessageNode, SessionDetail, SessionId } from '../../entities'
import { selectFocusedConversationId, useChatWorkbenchStore, useTreeStore } from '../../features'
import { useResponsive } from '../../shared/lib/useResponsive'
import { frontendLogger } from '../../shared/logging/logger'
import { EmptyState, StatusTag } from '../../shared/ui'
import { ContextMenu, ContextMenuProvider, useContextMenu } from './ContextMenu'
import { MessageComposer } from './MessageComposer'
import { MessageRenderer } from '../../components/messages'
import { useLongPress } from './useLongPress'

type ConversationCanvasProps = {
  currentSessionId: SessionId | null
  focusedConversationId: string | null
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
  selected: boolean
  conversationMessages: MessageNode[]
  messagesLoading: boolean
  messagesError: string | null
  conversationError: string | null
}

const DIAGRAM_POINTER_TOLERANCE_PX = 4
const FOCUS_OVERLAY_DURATION_MS = 500

type OverlayPhase = 'idle' | 'entering' | 'active' | 'exiting'

type FocusOverlayRect = {
  x: number
  y: number
  width: number
  height: number
  borderRadius: number
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

function FlowConversationNode({ data, id }: NodeProps<Node<FlowNodeData>>) {
  const {
    conversation,
    focused,
    selected,
  } = data

  const { setContextMenu } = useContextMenu()
  const draggingNodeId = useTreeStore((state) => state.draggingNodeId)
  const setDraggingNodeId = useTreeStore((state) => state.setDraggingNodeId)
  const clearDraggingNodeId = useTreeStore((state) => state.clearDraggingNodeId)
  const updateConversationNodePosition = useChatWorkbenchStore((state) => state.updateConversationNodePosition)
  const reactFlow = useReactFlow()

  const isDragging = draggingNodeId === conversation.conversationId
  const dragStartPosRef = useRef<{ x: number; y: number; nodeX: number; nodeY: number } | null>(null)

  const handleLongPress = useCallback(
    (event: React.TouchEvent | React.MouseEvent) => {
      setDraggingNodeId(conversation.conversationId)
      if (navigator.vibrate) {
        navigator.vibrate(50)
      }
      
      const clientX = 'touches' in event ? event.touches[0]?.clientX ?? 0 : event.clientX
      const clientY = 'touches' in event ? event.touches[0]?.clientY ?? 0 : event.clientY
      
      const node = reactFlow.getNode(conversation.conversationId)
      if (node) {
        dragStartPosRef.current = {
          x: clientX,
          y: clientY,
          nodeX: node.position.x,
          nodeY: node.position.y,
        }
      }
    },
    [conversation.conversationId, setDraggingNodeId, reactFlow]
  )

  const longPressHandlers = useLongPress(handleLongPress, {
    threshold: 500,
    moveThreshold: 10,
  })

  useEffect(() => {
    if (!isDragging) {
      dragStartPosRef.current = null
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStartPosRef.current) return

      const { x: startX, y: startY, nodeX, nodeY } = dragStartPosRef.current
      const deltaX = (event.clientX - startX) / reactFlow.getZoom()
      const deltaY = (event.clientY - startY) / reactFlow.getZoom()

      const newX = nodeX + deltaX
      const newY = nodeY + deltaY

      updateConversationNodePosition(conversation.conversationId, { x: newX, y: newY })
    }

    const handlePointerUp = () => {
      clearDraggingNodeId()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging, conversation.conversationId, reactFlow, updateConversationNodePosition, clearDraggingNodeId])

  const nodeClassName = [
    'conversation-node',
    selected ? 'conversation-node--selected' : null,
    isDragging ? 'conversation-node--dragging' : null,
  ].filter(Boolean).join(' ')

  return (
    <div
      className={nodeClassName}
      data-conversation-id={conversation.conversationId}
      aria-label={`查看对话 ${conversation.conversationId}`}
      {...longPressHandlers}
    >
      <Handle type="target" position={Position.Top} className="conversation-node__handle" isConnectable={false} />
      <Card
        size="small"
        className="conversation-node__card conversation-node__card--assistant"
      >
        <div className="conversation-node__body-frame">
          <div className="conversation-node__page-shell">
            <OverviewNodePage conversation={conversation} focused={focused} selected={selected} />
          </div>
        </div>
      </Card>
      <Handle type="source" position={Position.Bottom} className="conversation-node__handle" isConnectable={false} />
    </div>
  )
}

const nodeTypes = {
  conversation: FlowConversationNode,
} as const

function FocusOverlay({
  phase,
  originRect,
  conversation,
  conversationMessages,
  messagesLoading,
  messagesError,
  conversationError,
  sending,
  selectedConversationId,
  selectedConversationLabel,
  onSend,
  onStop,
  onSwitchToSendTarget,
}: {
  phase: OverlayPhase
  originRect: FocusOverlayRect | null
  conversation: ConversationNode | null
  conversationMessages: MessageNode[]
  messagesLoading: boolean
  messagesError: string | null
  conversationError: string | null
  sending: boolean
  selectedConversationId: string | null
  selectedConversationLabel: string | null
  onSend: (message: string, enableContext: boolean) => Promise<void>
  onStop: () => Promise<void>
  onSwitchToSendTarget: (conversationId: string) => void
}) {
  const responsive = useResponsive()

  if (phase === 'idle' || !originRect || !conversation) {
    return null
  }

  const isActive = phase === 'active' || phase === 'exiting'
  const isEntering = phase === 'entering'
  const isExiting = phase === 'exiting'

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  const initialTransform = `translate(${originRect.x}px, ${originRect.y}px) scale(${originRect.width / viewportWidth}, ${originRect.height / viewportHeight})`
  const activeTransform = 'translate(0.5%, 0.5%) scale(1, 1)'

  return (
    <div
      className={`focus-overlay ${isEntering ? 'focus-overlay--entering' : ''} ${isActive ? 'focus-overlay--active' : ''} ${isExiting ? 'focus-overlay--exiting' : ''}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        pointerEvents: isActive ? 'auto' : 'none',
        touchAction: isActive ? 'none' : 'auto',
      }}
      onTouchMove={(e) => {
        if (isActive) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onWheel={(e) => {
        if (isActive) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
    >
      <div
        className="focus-overlay__background"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: isActive ? 'var(--app-radius-lg)' : originRect.borderRadius,
          background: 'var(--app-card-bg)',
          backdropFilter: 'blur(20px)',
          transform: isEntering ? initialTransform : activeTransform,
          transformOrigin: 'top left',
          transition: isEntering ? 'none' : `transform ${FOCUS_OVERLAY_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), border-radius ${FOCUS_OVERLAY_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        }}
      />
      <div
        className="focus-overlay__content"
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: 'clamp(16px, 2vw, 24px)',
          opacity: isActive && !isExiting ? 1 : 0,
          transition: `opacity ${FOCUS_OVERLAY_DURATION_MS / 2}ms ease ${FOCUS_OVERLAY_DURATION_MS / 2}ms`,
        }}
      >
        <div className="focus-overlay__header">
          <Space direction="vertical" size={4}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {summarizeConversation(conversation)}
            </Typography.Title>
            <Typography.Text type="secondary">{conversation.conversationId}</Typography.Text>
          </Space>
        </div>

        <div className="focus-overlay__messages">
          {renderMessageList(conversationMessages, messagesLoading, messagesError, conversationError, 'focus-overlay__messages-list')}
        </div>

        <div className="focus-overlay__composer">
          <MessageComposer
            selectedConversationId={selectedConversationId}
            selectedConversationLabel={selectedConversationLabel}
            focusedConversationId={conversation.conversationId}
            focusedConversationLabel={summarizeConversation(conversation)}
            sending={sending}
            onSend={onSend}
            onStop={onStop}
            onSwitchToSendTarget={onSwitchToSendTarget}
          />
        </div>
      </div>
    </div>
  )
}

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
  const responsive = useResponsive()
  const setFocusedConversationId = useTreeStore((state) => state.setFocusedConversationId)
  const setLockedSendConversationId = useTreeStore((state) => state.setLockedSendConversationId)
  const storeFocusedConversationId = useTreeStore(selectFocusedConversationId)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLDivElement | null>(null)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [refreshMaskVisible, setRefreshMaskVisible] = useState(false)
  const lastZoomRef = useRef<number>(1)
  const isRefreshingRef = useRef(false)
  const zoomDebounceTimerRef = useRef<number | null>(null)

  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>('idle')
  const [focusOriginRect, setFocusOriginRect] = useState<FocusOverlayRect | null>(null)
  const [composerSlideOut, setComposerSlideOut] = useState(false)
  const previousFocusedIdRef = useRef<string | null>(null)

  const selectedConversation = useMemo(
    () => conversationNodes.find((conversation) => conversation.conversationId === lockedSendConversationId) ?? null,
    [conversationNodes, lockedSendConversationId],
  )
  const focusedConversation = useMemo(
    () => conversationNodes.find((conversation) => conversation.conversationId === focusedConversationId) ?? null,
    [conversationNodes, focusedConversationId],
  )

  const overviewLayoutMap = useMemo(() => buildTreeLayout(conversationNodes), [conversationNodes])

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const getNodeScreenRect = useCallback((conversationId: string): FocusOverlayRect | null => {
    const nodeElement = document.querySelector(`[data-conversation-id="${conversationId}"]`)
    if (!nodeElement) return null

    const rect = nodeElement.getBoundingClientRect()
    const cardElement = nodeElement.querySelector('.conversation-node__card')
    const borderRadius = cardElement ? parseFloat(window.getComputedStyle(cardElement).borderRadius) || 20 : 20

    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      borderRadius,
    }
  }, [])

  useEffect(() => {
    const wasFocused = previousFocusedIdRef.current
    const isNowFocused = focusedConversationId

    if (!wasFocused && isNowFocused) {
      const rect = getNodeScreenRect(isNowFocused)
      if (rect) {
        setFocusOriginRect(rect)
        setOverlayPhase('entering')
        setComposerSlideOut(true)

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setOverlayPhase('active')
          })
        })
      }
    } else if (wasFocused && !isNowFocused) {
      setOverlayPhase('exiting')
      setComposerSlideOut(false)

      const timer = window.setTimeout(() => {
        setOverlayPhase('idle')
        setFocusOriginRect(null)
      }, FOCUS_OVERLAY_DURATION_MS)

      return () => window.clearTimeout(timer)
    } else if (wasFocused && isNowFocused && wasFocused !== isNowFocused) {
      const rect = getNodeScreenRect(isNowFocused)
      if (rect) {
        setFocusOriginRect(rect)
      }
    }

    previousFocusedIdRef.current = isNowFocused
  }, [focusedConversationId, getNodeScreenRect])

  const focusMetrics = useMemo(() => {
    return { cardWidth: 320, bodyHeight: 220, centerYOffset: 0, visualWidth: 320, visualHeight: 220 }
  }, [])

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
        },
        className: [
          'conversation-flow-node',
          faded ? 'conversation-flow-node--dimmed' : null,
        ].filter(Boolean).join(' '),
        draggable: false,
      }
    })
  }, [
    conversationNodes,
    lockedSendConversationId,
    overviewLayoutMap,
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
        animated:
          lockedSendConversationId === conversation.conversationId ||
          focusedConversationId === conversation.conversationId,
        style: {
          strokeWidth:
            lockedSendConversationId === conversation.conversationId ||
            focusedConversationId === conversation.conversationId
              ? 2.5
              : 2,
          stroke:
            lockedSendConversationId === conversation.conversationId ||
            focusedConversationId === conversation.conversationId
              ? 'rgba(96, 165, 250, 0.95)'
              : 'rgba(148, 163, 184, 0.72)',
        },
      }))
  }, [conversationNodes, focusedConversationId, lockedSendConversationId])

  useEffect(() => {
    if (!flowNodes.length || !focusedConversation) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const position = resolveConversationPosition(focusedConversation, overviewLayoutMap)
      void reactFlow.setCenter(position.x, position.y, {
        duration: 420,
        ease: (value) => 1 - Math.pow(1 - value, 3),
      })
    }, 50)

    return () => window.clearTimeout(timeoutId)
  }, [flowNodes, focusedConversation, overviewLayoutMap, reactFlow])

  useEffect(() => {
    if (!focusedConversation) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      setFocusedConversationId(null)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusedConversation, setFocusedConversationId])

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

  const composerShellClassName = [
    'conversation-canvas__composer-shell',
    focusedConversation ? 'conversation-canvas__composer-shell--focused' : null,
    composerSlideOut ? 'conversation-canvas__composer-shell--slide-out' : null,
  ].filter(Boolean).join(' ')

  return (
    <div className={viewportClassName} onContextMenu={handleContextMenu} ref={viewportRef}>
      <FocusOverlay
        phase={overlayPhase}
        originRect={focusOriginRect}
        conversation={focusedConversation}
        conversationMessages={conversationMessages}
        messagesLoading={messagesLoading}
        messagesError={messagesError}
        conversationError={conversationDetail?.error ?? null}
        sending={sending}
        selectedConversationId={selectedConversation?.conversationId ?? null}
        selectedConversationLabel={selectedConversation ? summarizeConversation(selectedConversation) : null}
        onSend={onSendMessage}
        onStop={onStopMessage}
        onSwitchToSendTarget={setLockedSendConversationId}
      />

      <ReactFlow
        className={focusedConversation ? 'conversation-canvas__flow conversation-canvas__flow--focused' : 'conversation-canvas__flow'}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView
        panOnDrag={true}
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        nodesConnectable={false}
        elementsSelectable
        nodeClickDistance={DIAGRAM_POINTER_TOLERANCE_PX}
        paneClickDistance={DIAGRAM_POINTER_TOLERANCE_PX}
        onNodeClick={(_, node) => {
          if (focusedConversationId === node.id) {
            return
          }

          setFocusedConversationId(node.id)
        }}
        onPaneClick={() => {
          setContextMenu(null)
        }}
        onDoubleClick={() => {
          if (!focusedConversation) {
            reactFlow.fitView({ duration: 400, padding: 0.2 })
          }
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

      <div className={composerShellClassName} ref={composerRef}>
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
