import { Button, Card, Space, Typography } from 'antd'
import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import { EmptyState, StatusTag } from '../../shared/ui'
import { MessageComposer } from './MessageComposer'
import { currentSessionDetail, mockMessages } from './workspaceMocks'

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
}

export function ConversationCanvas({ focusedNodeId, onFocusNode }: ConversationCanvasProps) {
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
            <StatusTag label={`workspace ${currentSessionDetail.workspaceId}`} tone="default" />
            <StatusTag label={`节点 ${currentSessionDetail.nodeCount}`} tone="processing" />
            <StatusTag label={`分支 ${currentSessionDetail.branchCount}`} tone="warning" />
          </Space>
          <Typography.Text type="secondary" className="conversation-canvas__meta-text">
            当前阶段先验证全屏工作台布局；后续树图阶段会接入 React Flow 与真实节点数据。
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
            {mockMessages.map((message) => {
              const style = {
                left: message.position.left,
                top: message.position.top,
              } as CSSProperties

              const isFocused = focusedNodeId === message.id

              return (
                <button
                  key={message.id}
                  type="button"
                  className={isFocused ? 'conversation-node conversation-node--focused' : 'conversation-node'}
                  style={style}
                  onClick={() => onFocusNode(message.id)}
                  aria-label={`聚焦节点 ${message.title}`}
                >
                  <Card size="small" className={`conversation-node__card conversation-node__card--${message.role}`}>
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                        <Space wrap>
                          <Typography.Text strong>{message.title}</Typography.Text>
                          <Typography.Text type="secondary">{roleLabelMap[message.role]}</Typography.Text>
                        </Space>
                        <StatusTag label={message.statusLabel} tone={message.tone} />
                      </Space>
                      <Typography.Paragraph className="conversation-node__summary">{message.summary}</Typography.Paragraph>
                      <Typography.Text type="secondary">节点 {message.id}</Typography.Text>
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
                    <StatusTag label="待发送" tone="processing" />
                  </Space>
                  <Typography.Paragraph className="conversation-node__summary">
                    发送框保持在图内新建节点中，后续会直接映射到 React Flow 的节点交互语义。
                  </Typography.Paragraph>
                  <MessageComposer />
                </Space>
              </Card>
            </div>

            <div className="conversation-canvas__hint">
              <EmptyState
                title="React Flow 已纳入后续树图阶段"
                description="当前先校正全屏主视口与覆盖层关系，后续再接入真实节点数据、拖拽、缩放与 fitView。"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
