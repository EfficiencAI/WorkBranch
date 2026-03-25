import { Card, Space, Typography } from 'antd'
import { EmptyState, StatusTag } from '../../shared/ui'

export function WorkspaceCanvas() {
  return (
    <Card className="workspace-column workspace-column--canvas" title="主工作区">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <StatusTag label="待接入画布" tone="warning" />
        <Typography.Paragraph type="secondary">
          当前先展示三栏式工作台骨架，后续阶段再接入 React Flow 与消息树。
        </Typography.Paragraph>
        <div className="workspace-canvas-placeholder">
          <EmptyState
            title="工作区内容待接入"
            description="这里将承载会话树、消息流和交互工具栏。"
          />
        </div>
      </Space>
    </Card>
  )
}
