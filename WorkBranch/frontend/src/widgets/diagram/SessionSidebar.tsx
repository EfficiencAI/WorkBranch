import { App as AntdApp, Avatar, Button, Card, Input, List, Modal, Space, Typography } from 'antd'
import { useState } from 'react'
import type { SessionId, SessionSummary, UserProfile } from '../../entities'
import { selectUpdateUserNamePending, useUserStore } from '../../features'
import { StatusTag } from '../../shared/ui'

type SessionSidebarProps = {
  user: UserProfile
  sessions: SessionSummary[]
  selectedSessionId: SessionId | null
  creatingSession: boolean
  deletingSessionId: SessionId | null
  onCreateSession: () => Promise<void>
  onDeleteSession: (sessionId: SessionId) => Promise<void>
  onSelectSession: (sessionId: SessionId) => Promise<void>
}

export function SessionSidebar({
  user,
  sessions,
  selectedSessionId,
  creatingSession,
  deletingSessionId,
  onCreateSession,
  onDeleteSession,
  onSelectSession,
}: SessionSidebarProps) {
  const { message } = AntdApp.useApp()
  const updateNamePending = useUserStore(selectUpdateUserNamePending)
  const updateProfileName = useUserStore((state) => state.updateProfileName)
  const [isEditingName, setIsEditingName] = useState(false)
  const [draftName, setDraftName] = useState(user.name ?? '')

  function handleDeleteSession(sessionId: SessionId) {
    Modal.confirm({
      title: '确认删除该会话？',
      content: '删除后无法恢复。若当前正在查看该会话，将自动切换到其他可用会话。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => onDeleteSession(sessionId),
    })
  }

  async function handleSaveUserName() {
    const trimmedName = draftName.trim()
    if (!trimmedName) {
      void message.error('用户名不能为空')
      return
    }

    const profile = await updateProfileName(trimmedName)
    if (!profile) {
      void message.error('用户名保存失败')
      return
    }

    void message.success('用户名已更新')
    setIsEditingName(false)
  }

  const trimmedDraftName = draftName.trim()
  const currentName = user.name?.trim() ?? ''
  const disableSaveName = updateNamePending || !trimmedDraftName || trimmedDraftName === currentName

  return (
    <div className="session-sidebar" aria-label="图界面内嵌侧边栏内容">
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card size="small" className="session-sidebar__profile">
          <Space align="start" size="middle">
            <Avatar size={48}>{user.name?.slice(0, 1) ?? 'U'}</Avatar>
            <Space direction="vertical" size={2} style={{ width: '100%' }}>
              {isEditingName ? (
                <>
                  <Input
                    value={draftName}
                    maxLength={64}
                    disabled={updateNamePending}
                    placeholder="请输入用户名"
                    onChange={(event) => setDraftName(event.target.value)}
                    onPressEnter={() => void handleSaveUserName()}
                  />
                  <Space>
                    <Button
                      type="primary"
                      size="small"
                      loading={updateNamePending}
                      disabled={disableSaveName}
                      onClick={() => void handleSaveUserName()}
                    >
                      保存
                    </Button>
                    <Button
                      size="small"
                      disabled={updateNamePending}
                      onClick={() => {
                        setDraftName(user.name ?? '')
                        setIsEditingName(false)
                      }}
                    >
                      取消
                    </Button>
                  </Space>
                </>
              ) : (
                <>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                    <Typography.Text strong>{user.name ?? '未命名用户'}</Typography.Text>
                    <Button size="small" type="text" onClick={() => setIsEditingName(true)}>
                      编辑
                    </Button>
                  </Space>
                  <Typography.Text type="secondary">AI Coding Diagram</Typography.Text>
                  <StatusTag label="同层展开" tone="success" />
                </>
              )}
            </Space>
          </Space>
        </Card>

        <Input.Search placeholder="按标题、关键字或状态筛选" allowClear />

        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Button type="primary" loading={creatingSession} onClick={() => void onCreateSession()}>
            新建会话
          </Button>
        </Space>

        <div className="session-sidebar__list">
          <List
            split={false}
            locale={{ emptyText: '暂无会话，可先创建新会话。' }}
            dataSource={sessions}
            renderItem={(session) => {
              const isActive = selectedSessionId === session.id
              const isDeleting = deletingSessionId === session.id

              return (
                <List.Item
                  className={isActive ? 'session-sidebar__item session-sidebar__item--active' : 'session-sidebar__item'}
                  onClick={() => void onSelectSession(session.id)}
                  style={{ cursor: 'pointer' }}
                  actions={[
                    <Button
                      key="delete"
                      danger
                      type="text"
                      loading={isDeleting}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDeleteSession(session.id)
                      }}
                    >
                      删除
                    </Button>,
                  ]}
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                      <Typography.Text strong>{session.title}</Typography.Text>
                      <StatusTag label="历史会话" tone="default" />
                    </Space>
                    <Typography.Paragraph type="secondary" className="session-sidebar__preview">
                      当前按会话维度展示历史记录
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
