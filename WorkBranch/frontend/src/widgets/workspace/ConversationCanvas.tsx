import { Button, Card, Space, Typography } from 'antd'
import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import type { ConversationDetail, MessageNode, WorkspaceDetail } from '../../entities'
import { EmptyState, StatusTag } from '../../shared/ui'
import { MessageComposer } from './MessageComposer'

const roleLabelMap = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tool',
} as const

const zoomSteps = [0.8, 0.9, 1, 1.1, 1.25] as const

type ConversationCanvasProps = {
  focusedNodeId: string | null
  onFocusNode: (nodeId: string) => void
  conversationDetail: ConversationDetail | null
  workspaceDetail: WorkspaceDetail | null
  nodes: MessageNode[]
  sending: boolean
  onSendMessage: (message: string) => Promise<void>
}

function toStaticPosition(index: number) {
  const positions = [
    { left: '8%', top: '18%' },
    { left: '28%', top: '30%' },
    { left: '52%', top: '20%' },
    { left: '66%', top: '46%' },
  ]

  return positions[index] ?? { left: '38%', top: '64%' }
}

export function ConversationCanvas({
  focusedNodeId,
  onFocusNode,
  conversationDetail,
  workspaceDetail,
  nodes,
  sending,
  onSendMessage,
}: ConversationCanvasProps) {
  const [zoomIndex, setZoomIndex] = useState(2)
  const zoom = zoomSteps[zoomIndex]

  const zoomLabel = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom])

  return (
    <section className="conversation-canvas">
      <div className="conversation-canvas__backdrop" aria-hidden="true">
        <div className="conversation-canvas__glow conversation-canvas__glow--primary" />
        <div className="conversation-canvas__glow conversation-canvas__glow--secondary" />
      </div>

      <div className="conversation-canvas__viewport">
        <div className="conversation-canvas__overlay conversation-canvas__overlay--meta">
          <Space wrap>
            <StatusTag label={`workspace ${conversationDetail?.workspaceId ?? 'N/A'}`} tone="default" />
            <StatusTag label={`节点 ${nodes.length}`} tone="processing" />
            <StatusTag label={workspaceDetail?.dir ? 'workspace 已定位' : 'workspace 未定位'} tone="warning" />
          </Space>
          <Typography.Text type="secondary" className="conversation-canvas__meta-text">
            当前已接入后端 session / conversation / workspace API；后续树图阶段会接入 React Flow 与真实节点布局。
          </Typography.Text>
        </div>

        <div className="conversation-canvas__controls" role="toolbar" aria-label="画布缩放控制">
          <Button
            className="conversation-canvas__control-button"
            aria-label="缩小画布"
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex((current) => Math.max(0, current - 1))}
          >
            -
          </Button>
          <Typography.Text className="conversation-canvas__zoom-label">{zoomLabel}</Typography.Text>
          <Button
            className="conversation-canvas__control-button"
            aria-label="放大画布"
            disabled={zoomIndex === zoomSteps.length - 1}
            onClick={() => setZoomIndex((current) => Math.min(zoomSteps.length - 1, current + 1))}
          >
            +
          </Button>
          <Button className="conversation-canvas__control-button" onClick={() => setZoomIndex(2)}>
            适配
          </Button>
        </div>

        <div className="conversation-canvas__stage-shell">
          <div className="conversation-canvas__stage" style={{ transform: `scale(${zoom})` }}>
            {nodes.map((node, index) => {
              const position = toStaticPosition(index)
              const style = {
                left: position.left,
                top: position.top,
              } as CSSProperties

              const isFocused = focusedNodeId === node.id

              return (
                <button
                  key={node.id}
                  type="button"
                  className={isFocused ? 'conversation-node conversation-node--focused' : 'conversation-node'}
                  style={style}
                  onClick={() => onFocusNode(node.id)}
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
            })}

            <div className="conversation-node conversation-node--composer" style={{ left: '38%', top: '64%' }}>
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

            {!conversationDetail ? (
              <div className="conversation-canvas__hint">
                <EmptyState title="当前会话暂无活跃对话" description="请先在后端发起一次对话，或选择一个已有活跃对话的会话。" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
