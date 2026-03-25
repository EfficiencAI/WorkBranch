import { Button, Card, Space, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { EmptyState, StatusTag } from '../../shared/ui'

export function WorkspaceSidebar() {
  return (
    <Card className="workspace-column workspace-column--sidebar" title="导航与会话">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <StatusTag label="结构占位" tone="processing" />
        <Typography.Paragraph type="secondary">
          后续阶段在这里接入会话列表、用户信息和搜索能力。
        </Typography.Paragraph>
        <EmptyState
          title="暂无会话数据"
          description="当前阶段先固定应用结构，真实会话功能会在后续阶段接入。"
          action={
            <Button type="link">
              <Link to="/settings">查看设置页</Link>
            </Button>
          }
        />
      </Space>
    </Card>
  )
}
