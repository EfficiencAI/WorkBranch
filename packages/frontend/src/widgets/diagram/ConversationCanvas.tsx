import { Background, Handle, Position, ReactFlow, ReactFlowProvider, useOnViewportChange, useReactFlow } from '@xyflow/react'
import type { Edge, Node, NodeProps, Viewport } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button, Card, Spin, Space, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
  initialLoading?: boolean
  onSendMessage: (message: string, enableContext: boolean) => Promise<void>
  onStopMessage: () => Promise<void>
  onCreateConversation: (parentConversationId: string | null) => Promise<void>
  onDeleteConversation: (conversationId: string) => Promise<void>
  onAutoArrange: () => Promise<void>
}

// ─── 导航路径相关类型定义 ───

/** 导航路径中的单个节点项 */
interface NavigationPathItem {
  conversationId: string
}

/** 导航状态管理 */
interface NavigationState {
  /** 完整的导航路径：从根节点到当前节点 */
  path: NavigationPathItem[]
  /** 当前聚焦节点在路径中的索引 */
  currentIndex: number
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
    return `未命名对话`
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
  const focusedConversationId = useTreeStore((state) => state.focusedConversationId)
  const setFocusedConversationId = useTreeStore((state) => state.setFocusedConversationId)
  const setLockedSendConversationId = useTreeStore((state) => state.setLockedSendConversationId)
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
      onClick={(e) => {
        // 显式触发聚焦态
        if (focusedConversationId !== conversation.conversationId) {
          setFocusedConversationId(conversation.conversationId)
          setLockedSendConversationId(conversation.conversationId)
        }
      }}
    >
      <Handle type="target" position={Position.Top} className="conversation-node__handle" isConnectable={false} />
      <Card
        size="small"
        className="conversation-node__card conversation-node__card--assistant"
        {...longPressHandlers}
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
  conversationNodes,
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
  focusedConversationId,
  onNavigateToNode,
}: {
  phase: OverlayPhase
  originRect: FocusOverlayRect | null
  conversation: ConversationNode | null
  conversationNodes: ConversationNode[]
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
  focusedConversationId: string | null
  onNavigateToNode: (nodeId: string) => void
}) {
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
          padding: 0,
          opacity: isActive && !isExiting ? 1 : 0,
          transition: `opacity ${FOCUS_OVERLAY_DURATION_MS / 2}ms ease ${FOCUS_OVERLAY_DURATION_MS / 2}ms`,
        }}
      >
        <FocusView
          conversation={conversation}
          conversationNodes={conversationNodes}
          conversationMessages={conversationMessages}
          messagesLoading={messagesLoading}
          messagesError={messagesError}
          conversationError={conversationError}
          sending={sending}
          selectedConversationId={selectedConversationId}
          selectedConversationLabel={selectedConversationLabel}
          focusedConversationId={focusedConversationId}
          onSend={onSend}
          onStop={onStop}
          onSwitchToSendTarget={onSwitchToSendTarget}
          onNavigateToNode={onNavigateToNode}
        />
      </div>
    </div>
  )
}

const NODE_WIDTH = 320
const MIN_HORIZONTAL_GAP = 60
const VERTICAL_GAP = 240

// ─── 聚焦态界面（树导航 + 内容区） ───

// ─── 导航路径工具函数 ───

/**
 * 从目标节点构建完整导航路径：
 * 1. 向上追溯到根节点
 * 2. 向下自动穿透单子节点（无分支的节点），直到遇到分支或叶子节点
 *
 * @param anchorId 锚点节点 ID（用户点击进入聚焦态的节点）
 * @param allNodes 所有对话节点
 * @returns 从根节点到末端（分支前/叶子）的完整路径数组
 */
function buildNavigationPath(anchorId: string, allNodes: ConversationNode[]): NavigationPathItem[] {
  const nodeMap = new Map(allNodes.map((n) => [n.conversationId, n]))
  
  // ── 第一步：向上追溯到根节点 ──
  const upwardPath: string[] = []
  let current: string | null = anchorId
  while (current) {
    upwardPath.unshift(current)
    const node = nodeMap.get(current)
    current = node?.parentConversationId ?? null
  }
  
  // ── 第二步：向下自动穿透单子节点 ──
  const fullPath: string[] = [...upwardPath]
  let tailId = anchorId
  
  while (true) {
    const tailNode = nodeMap.get(tailId)
    if (!tailNode) break
    
    // 查找当前尾节点的所有直接子节点
    const children = allNodes.filter((n) => n.parentConversationId === tailId)
    
    if (children.length === 0) {
      // 叶子节点：停止延伸
      break
    } else if (children.length === 1) {
      // 单子节点（无分支）：自动加入路径并继续向下
      tailId = children[0].conversationId
      fullPath.push(tailId)
      // 继续循环检查这个单子节点的后代
    } else {
      // 多个分支：停止延伸，让用户选择
      break
    }
  }
  
  return fullPath.map((conversationId) => ({ conversationId }))
}

/**
 * 检查目标节点是否在当前导航路径内
 * @param targetId 目标节点 ID
 * @param navPath 当前导航路径
 * @returns 是否在路径内
 */
function isInNavigationPath(targetId: string, navPath: NavigationPathItem[]): boolean {
  return navPath.some((item) => item.conversationId === targetId)
}

interface FocusViewProps {
  conversation: ConversationNode | null
  conversationNodes: ConversationNode[]
  conversationMessages: MessageNode[]
  messagesLoading: boolean
  messagesError: string | null
  conversationError: string | null
  sending: boolean
  selectedConversationId: string | null
  selectedConversationLabel: string | null
  focusedConversationId: string | null
  onSend: (message: string, enableContext: boolean) => Promise<void>
  onStop: () => Promise<void>
  onSwitchToSendTarget: (conversationId: string) => void
  onNavigateToNode: (nodeId: string) => void
}

function FocusView({
  conversation,
  conversationNodes,
  conversationMessages,
  messagesLoading,
  messagesError,
  conversationError,
  sending,
  selectedConversationId,
  selectedConversationLabel,
  focusedConversationId,
  onSend,
  onStop,
  onSwitchToSendTarget,
  onNavigateToNode,
}: FocusViewProps) {
  const responsive = useResponsive()
  const [viewedNodeId, setViewedNodeId] = useState(() => conversation?.conversationId ?? '')
  const [treeWidth, setTreeWidth] = useState(200)
  const isResizing = useRef(false)
  // 程序化滚动标记：scrollIntoView 动画期间阻止滚动更新选中项
  const isProgrammaticScroll = useRef(false)

  // ─── 拖拽调整树宽度 ───
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return
      setTreeWidth(Math.max(120, Math.min(e.clientX, 500)))
    }
    const handleMouseUp = () => {
      if (!isResizing.current) return
      isResizing.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])
  
  // ─── 导航路径状态管理 ───
  const [navState, setNavState] = useState<NavigationState>({
    path: [],
    currentIndex: -1,
  })

  // ─── 从 store 获取消息缓存和加载方法（用于内容流中所有节点）───
  const conversationMessagesCache = useChatWorkbenchStore((state) => state.conversationMessagesCache)
  const loadConversationMessages = useChatWorkbenchStore((state) => state.loadConversationMessages)
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(new Set())

  // 同步外部 conversation 变化（进入/退出聚焦态时）
  useEffect(() => {
    if (conversation?.conversationId) {
      setViewedNodeId(conversation.conversationId)
      // 进入聚焦态时，构建从当前节点到根节点的完整路径
      const newPath = buildNavigationPath(conversation.conversationId, conversationNodes)
      setNavState({
        path: newPath,
        currentIndex: newPath.length - 1,
      })
    }
  }, [conversation?.conversationId])

  // ─── 预加载路径上所有节点的消息到缓存 ───
  useEffect(() => {
    if (navState.path.length === 0) return
    
    const preload = async () => {
      for (const pathItem of navState.path) {
        const { conversationId } = pathItem
        // 只加载尚未缓存的节点
        if (!conversationMessagesCache[conversationId] && !loadingNodeIds.has(conversationId)) {
          setLoadingNodeIds(prev => new Set(prev).add(conversationId))
          try {
            await loadConversationMessages(conversationId)
          } finally {
            setLoadingNodeIds(prev => {
              const next = new Set(prev)
              next.delete(conversationId)
              return next
            })
          }
        }
      }
    }
    
    preload()
  }, [navState.path])

  const viewedNode = useMemo(
    () => conversationNodes.find((n) => n.conversationId === viewedNodeId) ?? conversation ?? null,
    [conversationNodes, viewedNodeId, conversation],
  )

  const siblingCount = useMemo(() => {
    if (!viewedNode) return 0
    return conversationNodes.filter(
      (n) => n.parentConversationId === viewedNode.parentConversationId && n.conversationId !== viewedNodeId,
    ).length
  }, [conversationNodes, viewedNode])

  const childNodes = useMemo(
    () => conversationNodes.filter((n) => n.parentConversationId === viewedNodeId),
    [conversationNodes, viewedNodeId],
  )

  // ─── 统一的路径感知导航函数（滚动+高亮模式） ───
  const contentFlowRef = useRef<HTMLDivElement>(null)
  const userSelectTimeRef = useRef(0) // 记录用户最后点击分支树的时间戳

  const handleNavigate = useCallback(
    (nodeId: string) => {
      console.log('[DEBUG-handleNavigate] nodeId=', nodeId, 'viewedNodeId=', viewedNodeId, 'path=', navState.path.map((i) => i.conversationId))
      // 标记用户主动选择时间，阻止滚动检测在短时间内覆盖
      userSelectTimeRef.current = Date.now()
      if (nodeId === viewedNodeId) return

      // 路径感知逻辑：判断目标节点是否在当前路径内
      const inPath = isInNavigationPath(nodeId, navState.path)
      console.log('[DEBUG-handleNavigate] inPath=', inPath)
      if (inPath) {
        // 目标在路径内：平滑滚动到对应位置 + 高亮
        const targetEl = document.getElementById(`flow-section-${nodeId}`)
        if (targetEl) {
          targetEl.classList.add('flow-section--highlight')
          setTimeout(() => targetEl.classList.remove('flow-section--highlight'), 2000)
          isProgrammaticScroll.current = true
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
        // 同步 currentIndex 和 viewedNodeId
        const newIndex = navState.path.findIndex((item) => item.conversationId === nodeId)
        if (newIndex !== -1) {
          setNavState((prev) => ({ ...prev, currentIndex: newIndex }))
          if (nodeId !== viewedNodeId) {
            setViewedNodeId(nodeId)
          }
        }
      } else {
        // 目标在路径外：重建路径并重新渲染内容流
        const newPath = buildNavigationPath(nodeId, conversationNodes)
        setNavState({
          path: newPath,
          currentIndex: newPath.length - 1,
        })
        setViewedNodeId(nodeId)
        // 等待 DOM 更新后滚动到新位置
        requestAnimationFrame(() => {
          const targetEl = document.getElementById(`flow-section-${nodeId}`)
          if (targetEl) {
            isProgrammaticScroll.current = true
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        })
      }

      onNavigateToNode(nodeId)
    },
    [viewedNodeId, navState, conversationNodes, onNavigateToNode],
  )

  // ─── 滚动检测：视口中心点归属算法（防抖 + 程序化滚动标记 + scrollend） ───
  useEffect(() => {
    if (navState.path.length === 0) return

    const scrollContainer = contentFlowRef.current
    if (!scrollContainer) return

    let timer: ReturnType<typeof setTimeout> | null = null

    const updateActiveFromScroll = () => {
      console.log('[DEBUG-scroll] isProgrammaticScroll=', isProgrammaticScroll.current)
      // 检查是否有最近用户主动选择（1秒内不覆盖）
      const timeSinceUserSelect = Date.now() - userSelectTimeRef.current
      if (timeSinceUserSelect < 1000) {
        console.log('[DEBUG-scroll] SKIPPED - user select', timeSinceUserSelect, 'ms ago')
        return
      }
      const containerRect = scrollContainer.getBoundingClientRect()
      const centerY = containerRect.top + containerRect.height / 2

      // 找到视口中心点落在哪个 flow-section 内
      const sections = scrollContainer.querySelectorAll('.flow-section')
      let bestNode: string | null = null
      sections.forEach((section) => {
        const rect = section.getBoundingClientRect()
        if (centerY >= rect.top && centerY <= rect.bottom) {
          const nodeId = section.getAttribute('data-node-id')
          if (nodeId && navState.path.some((item) => item.conversationId === nodeId)) {
            bestNode = nodeId
          }
        }
      })

      console.log('[DEBUG-scroll] bestNode=', bestNode, 'viewedNodeId=', viewedNodeId)
      if (bestNode && bestNode !== viewedNodeId) {
        console.log('[DEBUG-scroll] UPDATING viewedNodeId to', bestNode)
        setViewedNodeId(bestNode)
        const index = navState.path.findIndex((item) => item.conversationId === bestNode)
        if (index !== -1 && index !== navState.currentIndex) {
          setNavState((prev) => ({ ...prev, currentIndex: index }))
        }
      }
    }

    // scroll 事件：程序化滚动期间跳过，用户滚动时防抖懒更新
    const handleScroll = () => {
      // 程序化滚动（scrollIntoView smooth）期间，不更新选中项
      if (isProgrammaticScroll.current) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(updateActiveFromScroll, 150)
    }

    // scrollend 事件：动画完全停止后清除标记，恢复正常检测
    const handleScrollEnd = () => {
      isProgrammaticScroll.current = false
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    scrollContainer.addEventListener('scrollend', handleScrollEnd, { passive: true })
    // 初始检测一次
    updateActiveFromScroll()

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll)
      scrollContainer.removeEventListener('scrollend', handleScrollEnd)
      if (timer) clearTimeout(timer)
    }
  }, [navState.path, viewedNodeId])

  // ─── 辅助函数：获取节点的子节点（用于分支选择器） ───
  const getChildrenForNode = useCallback(
    (nodeId: string) => conversationNodes.filter((n) => n.parentConversationId === nodeId),
    [conversationNodes],
  )

  // 构建祖先链（用于面包屑）
  const ancestorChain = useMemo(() => {
    const chain: ConversationNode[] = []
    let current: ConversationNode | undefined = viewedNode
    while (current) {
      chain.unshift(current)
      current = conversationNodes.find((n) => n.conversationId === current!.parentConversationId)
    }
    return chain
  }, [conversationNodes, viewedNode])

  const isMobile = responsive.isMobile

  // 构建节点查找映射
  const nodeMap = useMemo(() => new Map(conversationNodes.map((n) => [n.conversationId, n])), [conversationNodes])

  return (
    <div className={`focus-view ${isMobile ? 'focus-view--mobile' : ''}`}>
      {/* 左侧：树导航 */}
      <div className="focus-view__tree" style={{ width: treeWidth }}>
        <FocusTreeNav
          anchorId={navState.path[0]?.conversationId ?? viewedNodeId ?? focusedConversationId ?? ''}
          allNodes={conversationNodes}
          activeId={viewedNodeId}
          pathIds={new Set(navState.path.map((item) => item.conversationId))}
          onSelect={handleNavigate}
        />
      </div>

      {/* 拖拽调整手柄 */}
      {!isMobile && (
        <div className="focus-view__resize-handle" onMouseDown={handleResizeStart} />
      )}

      {/* 右侧：主内容区（无缝内容流） */}
      <div className="focus-view__main">
        {/* 面包屑 */}
        <FocusBreadcrumb chain={ancestorChain} activeId={viewedNodeId} onSelect={handleNavigate} />

        {/* 内容流容器 */}
        <div className="focus-view__content-flow" ref={contentFlowRef}>
          {navState.path.length > 0 ? (
            navState.path.map((pathItem, index) => {
              const node = nodeMap.get(pathItem.conversationId)
              if (!node) return null

              const isActive = pathItem.conversationId === viewedNodeId
              const children = getChildrenForNode(pathItem.conversationId)

              // 从缓存中获取该节点的完整消息
              const nodeMessages = conversationMessagesCache[pathItem.conversationId] ?? []
              const isNodeLoading = loadingNodeIds.has(pathItem.conversationId)

              return (
                <section
                  key={pathItem.conversationId}
                  className={`flow-section ${isActive ? 'flow-section--active' : ''}`}
                  data-node-id={pathItem.conversationId}
                  id={`flow-section-${pathItem.conversationId}`}
                >
                  {/* 节点标题头 */}
                  <div className="flow-section__header">
                    {index > 0 && <div className="flow-separator">↓</div>}
                    <Space direction="vertical" size={2}>
                      <Space align="center" size={9} wrap>
                        <Typography.Text strong style={{ fontSize: 14 }}>
                          {summarizeConversation(node)}
                        </Typography.Text>
                        {isActive && <span className="active-indicator-dot" />}
                      </Space>
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {node.conversationId}
                        {index + 1 < navState.path.length && ` → 第 ${index + 1}/${navState.path.length} 层`}
                        {nodeMessages.length > 0 && ` · ${nodeMessages.length} 条消息`}
                      </Typography.Text>
                    </Space>
                  </div>

                  {/* 所有节点都显示完整消息列表 */}
                  {isNodeLoading ? (
                    <div className="flow-section__loading">
                      <Spin size="small" />
                      <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                        加载中...
                      </Typography.Text>
                    </div>
                  ) : nodeMessages.length > 0 ? (
                    <div className="flow-section__messages">
                      {renderMessageList(nodeMessages, false, null, null, 'flow-section__messages-list')}
                    </div>
                  ) : (
                    <div className="flow-section__empty-messages">
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        暂无消息
                      </Typography.Text>
                    </div>
                  )}

                  {/* 分支选择器：仅在路径底部节点有多个子节点时显示 */}
                  {index === navState.path.length - 1 && children.length >= 2 && (
                    <div className="flow-section__branches">
                      <BranchSelector nodes={children} onSelect={handleNavigate} />
                    </div>
                  )}
                </section>
              )
            })
          ) : (
            /* 空状态 */
            <div className="focus-view__empty">
              <EmptyState description="暂无导航路径" />
            </div>
          )}
        </div>

        {/* 输入框固定在底部 */}
        <div className="focus-view__composer">
          <MessageComposer
            selectedConversationId={selectedConversationId}
            selectedConversationLabel={selectedConversationLabel}
            focusedConversationId={viewedNode?.conversationId ?? null}
            focusedConversationLabel={viewedNode ? summarizeConversation(viewedNode) : null}
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

// ─── 面包屑 ───

interface BreadcrumbProps {
  chain: ConversationNode[]
  activeId: string
  onSelect: (id: string) => void
}

function FocusBreadcrumb({ chain, activeId, onSelect }: BreadcrumbProps) {
  if (chain.length <= 1) return null

  return (
    <div className="focus-view__breadcrumb">
      {chain.map((node, idx) => {
        const isLast = idx === chain.length - 1
        return (
          <span key={node.conversationId} className="focus-view__breadcrumb-item">
            {idx > 0 && <span className="focus-view__breadcrumb-sep">→</span>}
            {isLast ? (
              <span className="focus-view__breadcrumb-label focus-view__breadcrumb-label--active">
                {summarizeConversation(node)}
              </span>
            ) : (
              <button
                className="focus-view__breadcrumb-label focus-view__breadcrumb-link"
                onClick={() => onSelect(node.conversationId)}
              >
                {summarizeConversation(node)}
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}

// ─── 分支选择器 ───

interface BranchSelectorProps {
  nodes: ConversationNode[]
  onSelect: (id: string) => void
}

function BranchSelector({ nodes, onSelect }: BranchSelectorProps) {
  return (
    <div className="focus-view__branches">
      <Typography.Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
        子节点
      </Typography.Text>
      <div className="focus-view__branch-cards">
        {nodes.map((node) => (
          <Card
            key={node.conversationId}
            size="small"
            className="focus-view__branch-card"
            onClick={() => onSelect(node.conversationId)}
          >
            <div className="focus-view__branch-title">{summarizeConversation(node)}</div>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {node.messageCount ?? 0} 条消息
            </Typography.Text>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── 树导航（Git Graph 风格，lane 列分配算法） ───

// ─── Git Graph 常量 ───
const PATH_COLOR = '#faad14'  // 路径高亮色（橙黄）
const BRANCH_COLOR = '#1677ff' // 分支统一蓝色
const ROW_HEIGHT = 32
const LANE_WIDTH = 10
const DOT_RADIUS = 5
const PADDING_X = 6
const PADDING_Y = 4

/** 布局节点：每个节点分配一个 lane（列）和 row（行） */
interface LayoutNode {
  id: string
  lane: number        // 第几列（0 开始）
  row: number         // 第几行（0 开始）
  color: string       // 分支颜色
  label: string       // 显示文本
  isActive: boolean   // 是否当前活跃节点
  isInNavPath: boolean // 是否在导航路径上
}

/** SVG 路径段 */
interface SvgPath {
  d: string
  color: string
  isOnPath?: boolean // 是否为路径连线（加粗）
}

/**
 * 核心：为树节点分配 lane（列）和 row（行），生成布局数据。
 * 算法：迭代式 DFS，lane = depth（深度），同级节点缩进一致。
 */
function buildLayout(
  nodes: TreeNodeData[],
  startLane: number,
  startRow: number,
  activeId: string,
  expandedIds: Set<string>,
  pathIds: Set<string>,
): { layoutNodes: LayoutNode[]; paths: SvgPath[]; nextRow: number } {
  const layoutNodes: LayoutNode[] = []
  const paths: SvgPath[] = []

  // 栈帧：记录当前层级的遍历状态
  interface StackFrame {
    siblings: TreeNodeData[]   // 当前层剩余待处理的兄弟节点
    parentInfo: { id: string; x: number; y: number } | null  // 父节点坐标（用于画连线）
    depth: number              // 当前深度（= lane）
  }

  const stack: StackFrame[] = [{ siblings: nodes, parentInfo: null, depth: startLane }]
  let currentRow = startRow

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]

    if (frame.siblings.length === 0) {
      // 当前层级遍历完毕，出栈
      stack.pop()
      continue
    }

    // 取出当前层的下一个节点
    const node = frame.siblings.shift()!
    const isInNavPath = pathIds.has(node.node.conversationId)
    const color = isInNavPath ? PATH_COLOR : BRANCH_COLOR
    const isActive = node.node.conversationId === activeId
    const lane = frame.depth
    const x = PADDING_X + lane * LANE_WIDTH + LANE_WIDTH / 2
    const y = PADDING_Y + currentRow * ROW_HEIGHT + ROW_HEIGHT / 2

    // 记录当前节点
    layoutNodes.push({
      id: node.node.conversationId,
      lane,
      row: currentRow,
      color,
      label: summarizeConversation(node.node),
      isActive,
      isInNavPath,
    })

    // 画父→子连线
    if (frame.parentInfo) {
      paths.push({
        d: `M ${frame.parentInfo.x} ${frame.parentInfo.y} Q ${frame.parentInfo.x} ${y} ${x} ${y}`,
        color,
        isOnPath: isInNavPath,
      })
    }

    currentRow++

    // 展开且有子节点时，将子节点作为新栈帧压入
    const isExpanded = expandedIds.has(node.node.conversationId)
    if (isExpanded && node.children.length > 0) {
      stack.push({
        siblings: [...node.children],
        parentInfo: { id: node.node.conversationId, x, y },
        depth: lane + 1,
      })
    }
  }

  return { layoutNodes, paths, nextRow: currentRow }
}

/** 计算 SVG 画布尺寸 */
function calcSvgSize(layoutNodes: LayoutNode[]): { width: number; height: number } {
  if (layoutNodes.length === 0) return { width: 200, height: 100 }
  const maxLane = Math.max(...layoutNodes.map((n) => n.lane))
  const maxRow = Math.max(...layoutNodes.map((n) => n.row))
  // 宽度：lane 区域 + 标签区域（按最长标签估算，不再固定 +200）
  // 高度：最后一行底部 + padding
  return {
    width: PADDING_X + (maxLane + 1) * LANE_WIDTH + LANE_WIDTH + 160,
    height: PADDING_Y + (maxRow + 1) * ROW_HEIGHT + PADDING_Y,
  }
}

interface TreeNavProps {
  anchorId: string
  allNodes: ConversationNode[]
  activeId: string
  pathIds: Set<string>   // 导航路径上的节点 ID 集合
  onSelect: (id: string) => void
}

function FocusTreeNav({ anchorId, allNodes, activeId, pathIds, onSelect }: TreeNavProps) {
  // useSyncExternalStore 直接订阅 zustand store，保证数据新鲜（解决 props stale 问题）
  const storeNodes = useSyncExternalStore(
    useChatWorkbenchStore.subscribe,
    () => useChatWorkbenchStore.getState().conversationNodes,
  )

  // 带指纹的手动缓存：避免 React StrictMode 双重渲染导致 useMemo 缓存异常，
  // 同时在父组件频繁 re-render 时避免重复计算
  const treeCacheRef = useRef<{ fingerprint: string; result: TreeNodeData[] }>({ fingerprint: '', result: [] })
  const currentFingerprint = `${anchorId ?? ''}-${storeNodes.length}`

  let rawTreeRoots: TreeNodeData[]
  if (treeCacheRef.current.fingerprint === currentFingerprint && treeCacheRef.current.result.length > 0) {
    rawTreeRoots = treeCacheRef.current.result // 缓存命中
  } else {
    rawTreeRoots = (!anchorId || storeNodes.length === 0) ? [] : buildFocusTree(anchorId, storeNodes)
    treeCacheRef.current = { fingerprint: currentFingerprint, result: rawTreeRoots }
  }

  // 导航兜底：resetState 导致 nodes 瞬间为空时使用上次有效结果
  const lastValidRootsRef = useRef<TreeNodeData[]>([])
  const treeRoots = rawTreeRoots.length > 0 ? rawTreeRoots : lastValidRootsRef.current
  if (rawTreeRoots.length > 0) lastValidRootsRef.current = rawTreeRoots

  // 同步收集所有节点 ID 作为展开集合（避免 useState + useEffect 时序竞态）
  const expandedIds = useMemo(() => {
    const ids = new Set<string>()
    function collect(nodes: TreeNodeData[]) {
      for (const n of nodes) {
        ids.add(n.node.conversationId)
        collect(n.children)
      }
    }
    collect(treeRoots)
    return ids
  }, [treeRoots])

  // 基于 lane 算法计算布局
  const { layoutNodes, paths, svgSize } = useMemo(() => {
    if (treeRoots.length === 0) return { layoutNodes: [] as LayoutNode[], paths: [] as SvgPath[], svgSize: { width: 200, height: 100 } }
    const result = buildLayout(treeRoots, 0, 0, activeId, expandedIds, pathIds)
    return {
      layoutNodes: result.layoutNodes,
      paths: result.paths,
      svgSize: calcSvgSize(result.layoutNodes),
    }
  }, [treeRoots, activeId, expandedIds, pathIds])

  return (
    <div className="focus-tree-nav">
      <svg width={svgSize.width} height={svgSize.height} xmlns="http://www.w3.org/2000/svg" className="git-graph-svg">
        {/* 连接线：路径加粗，非路径细 */}
        {paths.map((p, i) => (
          <path
            key={`line-${i}`}
            d={p.d}
            stroke={p.color}
            strokeWidth={p.isOnPath ? 2.5 : 1.5}
            fill="none"
            opacity={p.isOnPath ? 0.7 : 0.35}
            strokeLinecap="round"
          />
        ))}
        {/* 节点 */}
        {layoutNodes.map((node) => {
          const cx = PADDING_X + node.lane * LANE_WIDTH + LANE_WIDTH / 2
          const cy = PADDING_Y + node.row * ROW_HEIGHT + ROW_HEIGHT / 2
          return (
            <g key={node.id} onClick={() => onSelect(node.id)} style={{ cursor: 'pointer' }}>
              {/* 圆点：active 节点为实心，其他为空心 */}
              <circle
                cx={cx}
                cy={cy}
                r={node.isActive ? DOT_RADIUS + 1 : DOT_RADIUS}
                fill={node.isActive ? node.color : 'var(--app-panel-bg, #fff)'}
                stroke={node.isActive ? 'none' : node.color}
                strokeWidth={node.isActive ? 0 : 1.8}
              />
              {/* 标签文字：路径深色，非路径浅色 */}
              <text
                x={cx + DOT_RADIUS + 8}
                y={cy + 4}
                fontSize={13}
                fill={node.isInNavPath ? 'var(--app-text, #333)' : 'var(--app-text-secondary, #888)'}
                fontWeight={node.isActive ? 600 : (node.isInNavPath ? 500 : 400)}
              >
                {node.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

interface TreeNodeData {
  node: ConversationNode
  children: TreeNodeData[]
  isExpanded: boolean
  isOnPath: boolean
}

/**
 * 构建以 anchorId 为锚点的上下文子树。
 * 向上追溯到 root，向下展开直接子节点。
 */
function buildFocusTree(anchorId: string, allNodes: ConversationNode[]): TreeNodeData[] {
  const nodeMap = new Map(allNodes.map((n) => [n.conversationId, n]))

  // 全量：找到所有根节点
  const allRoots = allNodes.filter((n) => !n.parentConversationId)
  if (allRoots.length === 0) return []

  // 路径高亮仍基于锚点计算（用于橙黄连线）
  const pathSet = new Set(
    buildNavigationPath(anchorId, allNodes).map((item) => item.conversationId),
  )

  function build(nodeId: string): TreeNodeData {
    const node = nodeMap.get(nodeId)!
    const children = allNodes.filter((n) => n.parentConversationId === nodeId)
    const isOnPath = pathSet.has(nodeId)

    return {
      node,
      isExpanded: true,
      isOnPath,
      children: children.map((c) => build(c.conversationId)),
    }
  }

  return allRoots.map((r) => build(r.conversationId))
}

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
  initialLoading,
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
  const savedViewportRef = useRef<{ x: number; y: number; zoom: number } | null>(null)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [refreshMaskVisible, setRefreshMaskVisible] = useState(false)
  const lastZoomRef = useRef<number>(1)
  const isRefreshingRef = useRef(false)
  const zoomDebounceTimerRef = useRef<number | null>(null)

  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>('idle')
  const [focusOriginRect, setFocusOriginRect] = useState<FocusOverlayRect | null>(null)
  const [composerSlideOut, setComposerSlideOut] = useState(false)
  const previousFocusedIdRef = useRef<string | null>(null)
  // 聚焦态内浏览的节点ID（可独立于聚焦锚点变化）
  const [focusViewedId, setFocusViewedId] = useState<string | null>(null)

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

  const enterFocusMode = useCallback((conversationId: string) => {
    // 保存当前ReactFlow viewport状态
    const currentViewport = reactFlow.getViewport()
    savedViewportRef.current = { ...currentViewport }

    // 同步聚焦态浏览节点
    setFocusViewedId(conversationId)

    const rect = getNodeScreenRect(conversationId)

    if (!rect) {
      requestAnimationFrame(() => {
        const retryRect = getNodeScreenRect(conversationId)
        if (retryRect) {
          setFocusOriginRect(retryRect)
          setOverlayPhase('entering')
          setComposerSlideOut(true)

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setOverlayPhase('active')
            })
          })
        }
      })
      return
    }

    setFocusOriginRect(rect)
    setOverlayPhase('entering')
    setComposerSlideOut(true)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOverlayPhase('active')
      })
    })
  }, [getNodeScreenRect])

  const exitFocusMode = useCallback((): (() => void) => {
    setOverlayPhase('exiting')
    setComposerSlideOut(false)
    setFocusViewedId(null)

    // 恢复ReactFlow viewport状态
    if (savedViewportRef.current) {
      reactFlow.setViewport(savedViewportRef.current, { duration: 0 })
    }

    const timer = window.setTimeout(() => {
      setOverlayPhase('idle')
      setFocusOriginRect(null)
    }, FOCUS_OVERLAY_DURATION_MS)

    return () => window.clearTimeout(timer)
  }, [reactFlow])

  // 聚焦态内节点导航：更新浏览目标
  const handleFocusNavigateToNode = useCallback((nodeId: string) => {
    setFocusViewedId(nodeId)
  }, [])

  useEffect(() => {
    const wasFocused = previousFocusedIdRef.current
    const isNowFocused = focusedConversationId

    if (!wasFocused && isNowFocused) {
      enterFocusMode(isNowFocused)
    } else if (wasFocused && !isNowFocused) {
      previousFocusedIdRef.current = isNowFocused // 立即更新ref，避免return导致跳过
      return exitFocusMode()
    } else if (wasFocused && isNowFocused && wasFocused !== isNowFocused) {
      enterFocusMode(isNowFocused)
    }

    previousFocusedIdRef.current = isNowFocused
  }, [focusedConversationId, enterFocusMode, exitFocusMode])

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

    // 聚焦态下禁止移动视口，避免与 overlay 过渡动画冲突
    if (storeFocusedConversationId !== null) {
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
  }, [flowNodes, focusedConversation, overviewLayoutMap, reactFlow, storeFocusedConversationId])

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

      // 聚焦态下不显示预览态的右键菜单
      if (focusedConversationId) return

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
    [setContextMenu, focusedConversationId],
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
      {initialLoading ? (
        <div className="conversation-canvas__loading-overlay">
          <Spin size="large" tip="正在加载..." />
        </div>
      ) : null}
      <FocusOverlay
        phase={overlayPhase}
        originRect={focusOriginRect}
        conversation={focusedConversation}
        conversationNodes={conversationNodes}
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
        focusedConversationId={focusedConversationId}
        onNavigateToNode={handleFocusNavigateToNode}
      />

      <ReactFlow
        className={focusedConversation ? 'conversation-canvas__flow conversation-canvas__flow--focused' : 'conversation-canvas__flow'}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        fitView={!focusedConversation}
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
          setLockedSendConversationId(node.id)
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
