import { Avatar, Button, Card, Input, List, Space, Typography } from 'antd'
import { StatusTag } from '../../shared/ui'
import { mockSessions, mockUser } from './workspaceMocks'

export function SessionSidebar() {
  return (
    <Card className="workspace-column session-sidebar" title="SessionSidebar">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card size="small" className="session-sidebar__profile">
          <Space align="start" size="middle">
            <Avatar size={48}>{mockUser.name?.slice(0, 1) ?? 'U'}</Avatar>
            <Space direction="vertical" size={2}>
              <Typography.Text strong>{mockUser.name ?? '未命名用户'}</Typography.Text>
              <Typography.Text type="secondary">AI Coding Workspace</Typography.Text>
              <StatusTag label="在线预览" tone="success" />
            </Space>
          </Space>
        </Card>

        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Text strong>搜索会话</Typography.Text>
          <Input.Search placeholder="按标题、关键字或状态筛选" allowClear />
        </Space>

        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Button type="primary">新建会话</Button>
          <Button danger ghost disabled>
            删除占位
          </Button>
        </Space>

        <div className="session-sidebar__list">
          <List
            split={false}
            dataSource={mockSessions}
            renderItem={(session, index) => {
              const isActive = index === 0

              return (
                <List.Item className={isActive ? 'session-sidebar__item session-sidebar__item--active' : 'session-sidebar__item'}>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                      <Typography.Text strong>{session.title}</Typography.Text>
                      <StatusTag label={session.statusLabel} tone={session.tone} />
                    </Space>
                    <Typography.Paragraph type="secondary" className="session-sidebar__preview">
                      {session.preview}
                    </Typography.Paragraph>
                    <Typography.Text type="secondary">最近更新：{session.updatedAt}</Typography.Text>
                  </Space>
                </List.Item>
              )
            }}
          />
        </div>
      </Space>
    </Card>
  )
}
