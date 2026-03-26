import { Avatar, Button, Card, Input, List, Space, Typography } from 'antd'
import type { SessionSummary, UserProfile } from '../../entities'
import { StatusTag } from '../../shared/ui'

type SessionSidebarProps = {
  mode: 'history' | 'settings'
  user: UserProfile
  sessions: SessionSummary[]
  selectedSessionId: string | number | null
  onSelectSession: (sessionId: string | number) => void
  onOpenSettingsPage: () => void
}

export function SessionSidebar({ mode, user, sessions, selectedSessionId, onSelectSession, onOpenSettingsPage }: SessionSidebarProps) {
  return (
    <div className="session-sidebar" aria-label="工作台内嵌侧边栏内容">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{mode === 'history' ? '会话历史' : '工作台入口'}</Typography.Text>
          <Typography.Text type="secondary">
            {mode === 'history'
              ? '侧边栏继续按 session 展示历史；workspace 归属在当前 conversation 视图中体现。'
              : '设置入口保持在同一侧边栏容器内部，不再切成独立面板。'}
          </Typography.Text>
        </Space>

        <Card size="small" className="session-sidebar__profile">
          <Space align="start" size="middle">
            <Avatar size={48}>{user.name?.slice(0, 1) ?? 'U'}</Avatar>
            <Space direction="vertical" size={2}>
              <Typography.Text strong>{user.name ?? '未命名用户'}</Typography.Text>
              <Typography.Text type="secondary">AI Coding Workspace</Typography.Text>
              <StatusTag label="同层展开" tone="success" />
            </Space>
          </Space>
        </Card>

        {mode === 'settings' ? (
          <Card size="small" className="session-sidebar__shortcut-card">
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Text strong>设置入口</Typography.Text>
              <Typography.Text type="secondary">
                当前阶段设置仍保持独立路由，但入口继续收纳在同一个侧边栏背景中。
              </Typography.Text>
              <Button type="primary" onClick={onOpenSettingsPage}>
                打开设置页
              </Button>
            </Space>
          </Card>
        ) : null}

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
            dataSource={sessions}
            renderItem={(session) => {
              const isActive = selectedSessionId === session.id

              return (
                <List.Item
                  className={isActive ? 'session-sidebar__item session-sidebar__item--active' : 'session-sidebar__item'}
                  onClick={() => onSelectSession(session.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                      <Typography.Text strong>{session.title}</Typography.Text>
                      <StatusTag
                        label={session.hasActiveConversation ? '活跃对话' : '历史会话'}
                        tone={session.hasActiveConversation ? 'processing' : 'default'}
                      />
                    </Space>
                    <Typography.Paragraph type="secondary" className="session-sidebar__preview">
                      {session.activeConversationId ? `active_conversation_id: ${session.activeConversationId}` : '当前暂无活跃对话'}
                    </Typography.Paragraph>
                    <Typography.Text type="secondary">最近更新：{session.updatedAt ?? '未知'}</Typography.Text>
                  </Space>
                </List.Item>
              )
            }}
          />
        </div>
      </Space>
    </div>
  )
}
