import { Button, Card, Space, Typography } from 'antd'
import { EmptyState, StatusTag } from '../../shared/ui'
import { MessageComposer } from './MessageComposer'
import { currentSessionDetail, mockMessages } from './workspaceMocks'

const roleLabelMap = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tool',
} as const

export function ConversationCanvas() {
  return (
    <Card className="workspace-column conversation-canvas" title="ConversationCanvas">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div className="conversation-canvas__toolbar">
          <Space direction="vertical" size={6}>
            <Typography.Title level={4} className="conversation-canvas__title">
              {currentSessionDetail.title}
            </Typography.Title>
            <Space wrap>
              <StatusTag label="静态主链路" tone="processing" />
              <StatusTag label={`节点 ${currentSessionDetail.nodeCount}`} tone="default" />
              <StatusTag label={`分支 ${currentSessionDetail.branchCount}`} tone="warning" />
            </Space>
          </Space>

          <Space wrap>
            <Button>聚焦当前节点</Button>
            <Button>适配画布</Button>
            <Button disabled>React Flow 待接入</Button>
          </Space>
        </div>

        <div className="conversation-canvas__content">
          {mockMessages.map((message, index) => (
            <div
              key={message.id}
              className={index === 1 ? 'conversation-node conversation-node--active' : 'conversation-node'}
            >
              <div className="conversation-node__line" />
              <Card size="small" className="conversation-node__card">
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
                    <Space wrap>
                      <Typography.Text strong>{message.title}</Typography.Text>
                      <Typography.Text type="secondary">{roleLabelMap[message.role]}</Typography.Text>
                    </Space>
                    <StatusTag label={message.statusLabel} tone={message.tone} />
                  </Space>
                  <Typography.Paragraph className="conversation-node__summary">
                    {message.summary}
                  </Typography.Paragraph>
                  <Typography.Paragraph type="secondary" className="conversation-node__content">
                    {message.content}
                  </Typography.Paragraph>
                  <Typography.Text type="secondary">节点 {message.id} · {message.createdAt}</Typography.Text>
                </Space>
              </Card>
            </div>
          ))}
        </div>

        <div className="conversation-canvas__empty-panel">
          <EmptyState
            title="对比分支区域待接入"
            description="后续树形消息阶段会在这里补充分支对比、画布缩放和节点关系展示。"
          />
        </div>

        <MessageComposer />
      </Space>
    </Card>
  )
}
