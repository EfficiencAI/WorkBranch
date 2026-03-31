import { Background, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button, Card, Space, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSettings } from '../../app/settings'
import type { ConversationDetail, ConversationNode, MessageNode, SessionDetail, SessionId, WorkspaceDetail } from '../../entities'
import { selectFocusedConversationId, useTreeStore } from '../../features'
import { frontendLogger } from '../../shared/logging/logger'
import { EmptyState, StatusTag } from '../../shared/ui'
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
  conversationMessages: MessageNode[]
  messagesLoading: boolean
  messagesError: string | null
  workspaceId: string | null
  conversationError: string | null
  sending: boolean
  onSendMessage: (message: string) => Promise<void>
  onStopMessage: () => Promise<void>
  onCreateConversation: (parentConversationId: string | null) => Promise<void>
  onExitFocus: () => void
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

function FlowConversationNode({ data }: NodeProps<Node<FlowNodeData>>) {
  const {
    conversation,
    focused,
    selected,
    conversationMessages = [],
    messagesLoading = false,
    messagesError = null,
    workspaceId,
    conversationError,
    sending = false,
    onSendMessage,
    onStopMessage,
    onCreateConversation,
    onExitFocus,
  } = data

  return (
    <div
      className={focused ? 'conversation-node conversation-node--focused' : selected ? 'conversation-node conversation-node--selected' : 'conversation-node'}
      data-conversation-id={conversation.conversationId}
      aria-label={`查看对话 ${conversation.conversationId}`}
    >
      <Card size="small" className={focused ? 'conversation-node__card conversation-node__card--assistant conversation-node__card--focused' : 'conversation-node__card conversation-node__card--assistant'}>
        <Space direction="vertical" size={focused ? 14 : 10} style={{ width: '100%' }}>
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
              {focused ? (
                <>
                  <Button size="small" className="nodrag nopan" onClick={() => void onCreateConversation(conversation.conversationId)}>
                    创建子对话
                  </Button>
                  <Button size="small" className="nodrag nopan" onClick={onExitFocus}>
                    退出聚焦
                  </Button>
                </>
              ) : null}
            </Space>
          </Space>

          <Space wrap>
            <StatusTag label={`${conversation.messageCount} 条消息`} tone="default" />
            {conversation.parentConversationId ? <StatusTag label={`父对话 ${conversation.parentConversationId}`} tone="default" /> : <StatusTag label="根对话" tone="success" />}
          </Space>

          {focused ? (
            <div className="conversation-node__focused-body nodrag nopan" onClick={stopEvent} onDoubleClick={stopEvent}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                  <Typography.Text strong>消息列表</Typography.Text>
                  <StatusTag
                    label={messagesLoading ? '加载中' : messagesError ? '加载失败' : `${conversationMessages.length} 条`}
                    tone={messagesError ? 'error' : messagesLoading ? 'processing' : 'default'}
                  />
                </Space>

                {conversationError ? <Typography.Text type="danger">{conversationError}</Typography.Text> : null}
                {messagesError ? <Typography.Text type="danger">{messagesError}</Typography.Text> : null}

                {!messagesLoading && !messagesError && conversationMessages.length === 0 ? (
                  <Typography.Text type="secondary">当前对话暂无消息。</Typography.Text>
                ) : null}

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
                            <Typography.Paragraph style={{ marginBottom: 0 }}>{message.content}</Typography.Paragraph>
                          </Space>
                        </Card>
                      ))}
                    </Space>
                  </div>
                ) : null}

                <div className="conversation-node__composer-shell">
                  <MessageComposer
                    workspaceId={workspaceId}
                    selectedConversationId={conversation.conversationId}
                    selectedConversationLabel={summarizeConversation(conversation)}
                    sending={sending}
                    onSend={onSendMessage}
                    onStop={onStopMessage}
                  />
                </div>
              </Space>
            </div>
          ) : null}
        </Space>
      </Card>
    </div>
  )
}

const nodeTypes = {
  conversation: FlowConversationNode,
} as const

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
  const selectionTimeoutRef = useRef<number | null>(null)

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

  const overviewLayoutMap = useMemo(() => buildTreeLayout(conversationNodes), [conversationNodes])

  const flowNodes = useMemo<Array<Node<FlowNodeData>>>(() => {
    return conversationNodes.map((conversation) => {
      const focused = storeFocusedConversationId === conversation.conversationId
      return {
        id: conversation.conversationId,
        type: 'conversation',
        position: overviewLayoutMap.get(conversation.conversationId) ?? { x: 0, y: 0 },
        data: {
          conversation,
          focused,
          selected: selectedConversationId === conversation.conversationId,
          conversationMessages: focused ? conversationMessages : [],
          messagesLoading: focused ? messagesLoading : false,
          messagesError: focused ? messagesError : null,
          workspaceId: focused ? conversationDetail?.workspaceId ?? null : null,
          conversationError: focused ? conversationDetail?.error ?? null : null,
          sending: focused ? sending : false,
          onSendMessage,
          onStopMessage,
          onCreateConversation,
          onExitFocus: () => setFocusedConversationId(null),
        },
        draggable: false,
      }
    })
  }, [
    conversationNodes,
    conversationDetail?.workspaceId,
    conversationMessages,
    messagesError,
    messagesLoading,
    onCreateConversation,
    onSendMessage,
    onStopMessage,
    overviewLayoutMap,
    selectedConversationId,
    sending,
    setFocusedConversationId,
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
        animated: selectedConversationId === conversation.conversationId || focusedConversationId === conversation.conversationId,
      }))
  }, [conversationNodes, focusedConversationId, selectedConversationId])

  useEffect(() => {
    return () => {
      if (selectionTimeoutRef.current !== null) {
        window.clearTimeout(selectionTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!flowNodes.length) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      if (focusedConversation) {
        const position = overviewLayoutMap.get(focusedConversation.conversationId) ?? { x: 0, y: 0 }
        void reactFlow.setCenter(position.x + 320, position.y + 220, { zoom: 1.15, duration: 260 })
        return
      }

      void reactFlow.fitView({ padding: 0.2, duration: 240, includeHiddenNodes: true })
    }, 50)

    return () => window.clearTimeout(timeoutId)
  }, [flowNodes, focusedConversation, overviewLayoutMap, reactFlow])

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
            {focusedConversation ? '当前通过摄像机聚焦展示节点完整内容。' : '当前显示该 session 下的对话树，可右键空白创建根对话，右键节点创建子对话。'}
          </Typography.Text>
        </div>
      ) : null}

      <div className="conversation-canvas__controls" role="toolbar" aria-label="画布控制">
        <Button className="conversation-canvas__control-button" onClick={() => void reactFlow.zoomOut({ duration: 180 })}>
          -
        </Button>
        <Button className="conversation-canvas__control-button" onClick={() => void reactFlow.zoomIn({ duration: 180 })}>
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
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        nodesConnectable={false}
        elementsSelectable
        onNodeClick={(_, node) => {
          if (selectionTimeoutRef.current !== null) {
            window.clearTimeout(selectionTimeoutRef.current)
          }

          selectionTimeoutRef.current = window.setTimeout(() => {
            frontendLogger.info('switch_conversation', {
              extra: {
                conversation_id: node.id,
                previous_conversation_id: selectedConversationId,
              },
            })
            setSelectedConversationId(node.id)
            selectionTimeoutRef.current = null
          }, 200)
        }}
        onNodeDoubleClick={(_, node) => {
          if (selectionTimeoutRef.current !== null) {
            window.clearTimeout(selectionTimeoutRef.current)
            selectionTimeoutRef.current = null
          }
          setSelectedConversationId(node.id)
          setFocusedConversationId(node.id)
        }}
        onPaneClick={() => {
          if (selectionTimeoutRef.current !== null) {
            window.clearTimeout(selectionTimeoutRef.current)
            selectionTimeoutRef.current = null
          }
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

      {!focusedConversation ? (
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
      ) : null}
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
