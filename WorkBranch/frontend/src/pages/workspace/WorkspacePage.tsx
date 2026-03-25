import { Space, Typography } from 'antd'
import { WorkspaceShell } from '../../widgets'

export function WorkspacePage() {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2}>工作台</Typography.Title>
        <Typography.Paragraph type="secondary">
          第四阶段先把静态工作台界面搭完整，后续阶段再逐步接入 Zustand、会话数据、树图和 SSE 聊天链路。
        </Typography.Paragraph>
      </div>
      <WorkspaceShell />
    </Space>
  )
}
