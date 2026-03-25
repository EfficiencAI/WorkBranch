import { Space, Typography } from 'antd'
import { WorkspaceShell } from '../../widgets'

export function WorkspacePage() {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title level={2}>工作台</Typography.Title>
        <Typography.Paragraph type="secondary">
          第二阶段先固定三栏式布局与页面路由，后续阶段再逐步接入会话、树图和聊天能力。
        </Typography.Paragraph>
      </div>
      <WorkspaceShell />
    </Space>
  )
}
