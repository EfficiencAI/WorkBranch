import { App as AntdApp, Avatar, Button, Input, List, Modal, Space, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useState } from 'react'
import type { SessionId, SessionSummary, UserProfile } from '../../entities'
import { selectUpdateUserNamePending, useUserStore } from '../../features'

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
      {/* 用户资料区 */}
      <section className="session-sidebar__profile">
        <Avatar size={40}>{user.name?.slice(0, 1) ?? 'U'}</Avatar>
        <div className="session-sidebar__user-info">
          {isEditingName ? (
            <>
              <Input
                value={draftName}
                maxLength={64}
                disabled={updateNamePending}
                placeholder="请输入用户名"
                size="small"
                onChange={(event) => setDraftName(event.target.value)}
                onPressEnter={() => void handleSaveUserName()}
              />
              <Space size={4}>
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
              <Space style={{ width: '100%', justifyContent: 'space-between' }} align="center">
                <Typography.Text strong style={{ fontSize: 'var(--app-font-size-md)' }}>
                  {user.name ?? '未命名用户'}
                </Typography.Text>
                <Button size="small" type="text" onClick={() => setIsEditingName(true)}>
                  编辑
                </Button>
              </Space>
              <Typography.Text type="secondary" style={{ fontSize: 'var(--app-font-size-xs)' }}>
                AI Coding Diagram
              </Typography.Text>
            </>
          )}
        </div>
      </section>

      {/* 操作区：搜索 + 新建 */}
      <section className="session-sidebar__actions">
        <Input.Search
          placeholder="搜索会话..."
          allowClear
          className="session-sidebar__search"
        />
        <Button
          type="primary"
          block
          icon={<PlusOutlined />}
          loading={creatingSession}
          onClick={() => void onCreateSession()}
          className="session-sidebar__create-btn"
        >
          新建会话
        </Button>
      </section>

      {/* 会话列表区 */}
      <section className="session-sidebar__list">
        <List
          split={false}
          locale={{ emptyText: '暂无会话，点击上方按钮创建' }}
          dataSource={sessions}
          renderItem={(session) => {
            const isActive = selectedSessionId === session.id
            const isDeleting = deletingSessionId === session.id

            return (
              <List.Item
                className={`session-sidebar__item ${isActive ? 'session-sidebar__item--active' : ''}`}
                onClick={() => void onSelectSession(session.id)}
                actions={[
                  <Button
                    key="delete"
                    danger
                    type="text"
                    size="small"
                    loading={isDeleting}
                    className="session-sidebar__delete-btn"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDeleteSession(session.id)
                    }}
                  >
                    删除
                  </Button>,
                ]}
              >
                <div className="session-sidebar__item-content">
                  <Typography.Text strong className="session-sidebar__item-title">
                    {session.title}
                  </Typography.Text>
                  <Typography.Text type="secondary" className="session-sidebar__item-time">
                    最近更新：{session.updatedAt ?? '未知'}
                  </Typography.Text>
                </div>
              </List.Item>
            )
          }}
        />
      </section>
    </div>
  )
}
