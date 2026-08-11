import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined, SearchOutlined, SortDescendingOutlined } from '@ant-design/icons'
import { App as AntdApp, Avatar, Button, Dropdown, Empty, Input, Tooltip, Typography } from 'antd'
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
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

type SessionGroupKey = 'today' | 'yesterday' | 'week' | 'earlier'

const SESSION_GROUPS: Array<{ key: SessionGroupKey; label: string }> = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'week', label: '最近 7 天' },
  { key: 'earlier', label: '更早' },
]

function parseSessionDate(value?: string) {
  if (!value) return null

  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getSessionGroup(session: SessionSummary, now = new Date()): SessionGroupKey {
  const rawTime = session.updatedAt ?? session.createdAt
  if (rawTime?.includes('刚刚') || rawTime?.includes('分钟前') || /^\d{1,2}:\d{2}$/.test(rawTime ?? '')) return 'today'
  if (rawTime?.includes('昨天')) return 'yesterday'

  const date = parseSessionDate(rawTime)
  if (!date) return 'earlier'

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayOffset = Math.floor((today.getTime() - target.getTime()) / 86_400_000)
  if (dayOffset <= 0) return 'today'
  if (dayOffset === 1) return 'yesterday'
  if (dayOffset < 7) return 'week'
  return 'earlier'
}

function formatSessionTime(session: SessionSummary) {
  const rawTime = session.updatedAt ?? session.createdAt
  if (!rawTime) return '未知'
  if (/刚刚|分钟前|昨天|周[一二三四五六日天]/.test(rawTime)) return rawTime

  const date = parseSessionDate(rawTime)
  if (!date) return rawTime

  const group = getSessionGroup(session)
  if (group === 'today') {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date)
  }
  if (group === 'yesterday') return '昨天'
  if (group === 'week') return new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date)
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(value: string, query: string): ReactNode {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return value

  return value
    .split(new RegExp(`(${escapeRegExp(normalizedQuery)})`, 'gi'))
    .map((part, index) => (part.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : part))
}

export function SessionSidebar({ user, sessions, selectedSessionId, creatingSession, deletingSessionId, onCreateSession, onDeleteSession, onSelectSession }: SessionSidebarProps) {
  const { message, modal } = AntdApp.useApp()
  const updateNamePending = useUserStore(selectUpdateUserNamePending)
  const updateProfileName = useUserStore((state) => state.updateProfileName)
  const [isEditingName, setIsEditingName] = useState(false)
  const [draftName, setDraftName] = useState(user.name ?? '')
  const [searchQuery, setSearchQuery] = useState('')

  function handleDeleteSession(sessionId: SessionId) {
    modal.confirm({
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

  function cancelNameEditing() {
    setDraftName(user.name ?? '')
    setIsEditingName(false)
  }

  function selectSessionWithKeyboard(event: KeyboardEvent<HTMLDivElement>, sessionId: SessionId) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    void onSelectSession(sessionId)
  }

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredSessions = useMemo(() => {
    if (!normalizedQuery) return sessions

    return sessions.filter((session) => {
      const searchable = [session.title, session.id, session.status, session.updatedAt, session.createdAt]
        .filter((value) => value !== undefined && value !== null)
        .join(' ')
        .toLocaleLowerCase()
      return searchable.includes(normalizedQuery)
    })
  }, [normalizedQuery, sessions])

  const groupedSessions = useMemo(() => {
    const groups = new Map<SessionGroupKey, SessionSummary[]>()
    SESSION_GROUPS.forEach(({ key }) => groups.set(key, []))
    filteredSessions.forEach((session) => groups.get(getSessionGroup(session))?.push(session))
    return SESSION_GROUPS.map((group) => ({
      ...group,
      sessions: groups.get(group.key) ?? [],
    })).filter((group) => group.sessions.length > 0)
  }, [filteredSessions])

  const trimmedDraftName = draftName.trim()
  const currentName = user.name?.trim() ?? ''
  const disableSaveName = updateNamePending || !trimmedDraftName || trimmedDraftName === currentName
  const displayName = user.name?.trim() || '未命名用户'

  return (
    <div className="session-sidebar" aria-label="会话历史">
      <section className="session-sidebar__profile" aria-label="用户资料">
        <Avatar shape="square" size={38} src={user.avatarUrl}>
          {displayName.slice(0, 2)}
        </Avatar>
        <div className="session-sidebar__user-info">
          {isEditingName ? (
            <Input
              value={draftName}
              maxLength={64}
              disabled={updateNamePending}
              placeholder="请输入用户名"
              size="small"
              autoFocus
              onChange={(event) => setDraftName(event.target.value)}
              onPressEnter={() => void handleSaveUserName()}
            />
          ) : (
            <>
              <Typography.Text strong className="session-sidebar__user-name">
                {displayName}
              </Typography.Text>
              <Typography.Text type="secondary" className="session-sidebar__user-subtitle">
                AI Coding Diagram · 本地工作台
              </Typography.Text>
            </>
          )}
        </div>
        {isEditingName ? (
          <div className="session-sidebar__profile-actions">
            <Tooltip title="保存用户名">
              <Button type="text" size="small" aria-label="保存用户名" icon={<CheckOutlined />} loading={updateNamePending} disabled={disableSaveName} onClick={() => void handleSaveUserName()} />
            </Tooltip>
            <Tooltip title="取消编辑">
              <Button type="text" size="small" aria-label="取消编辑" icon={<CloseOutlined />} disabled={updateNamePending} onClick={cancelNameEditing} />
            </Tooltip>
          </div>
        ) : (
          <Tooltip title="编辑用户名">
            <Button type="text" size="small" aria-label="编辑用户名" icon={<EditOutlined />} onClick={() => setIsEditingName(true)} />
          </Tooltip>
        )}
      </section>

      <section className="session-sidebar__actions" aria-label="会话操作">
        <div className="session-sidebar__tool-row">
          <Input
            value={searchQuery}
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索标题、ID 或状态"
            className="session-sidebar__search"
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Tooltip title="新建会话">
            <Button type="primary" icon={<PlusOutlined />} loading={creatingSession} aria-label="新建会话" onClick={() => void onCreateSession()} className="session-sidebar__create-btn" />
          </Tooltip>
        </div>
        <div className="session-sidebar__list-meta">
          <span>{normalizedQuery ? `${filteredSessions.length} 个匹配会话` : `${sessions.length} 个会话`}</span>
          <span className="session-sidebar__sort">
            <SortDescendingOutlined />
            最近更新
          </span>
        </div>
      </section>

      <section className="session-sidebar__list" aria-label="会话列表">
        {groupedSessions.map((group) => (
          <div className="session-sidebar__group" key={group.key}>
            <div className="session-sidebar__group-heading">
              <span>{group.label}</span>
              <span>{group.sessions.length}</span>
            </div>
            {group.sessions.map((session) => {
              const isActive = selectedSessionId === session.id
              const isDeleting = deletingSessionId === session.id
              const subtitle = session.status ? `${session.status} · 会话 #${session.id}` : `会话 #${session.id}`

              return (
                <div
                  key={session.id}
                  role="button"
                  tabIndex={0}
                  aria-current={isActive ? 'page' : undefined}
                  className={`session-sidebar__item ${isActive ? 'session-sidebar__item--active' : ''}`}
                  onClick={() => void onSelectSession(session.id)}
                  onKeyDown={(event) => selectSessionWithKeyboard(event, session.id)}
                >
                  <div className="session-sidebar__item-content">
                    <Typography.Text strong className="session-sidebar__item-title">
                      {highlightText(session.title || `未命名会话 #${session.id}`, searchQuery)}
                    </Typography.Text>
                    <Typography.Text type="secondary" className="session-sidebar__item-summary">
                      {highlightText(subtitle, searchQuery)}
                    </Typography.Text>
                  </div>
                  <div className="session-sidebar__item-side">
                    <Typography.Text type="secondary" className="session-sidebar__item-time">
                      {formatSessionTime(session)}
                    </Typography.Text>
                    <Dropdown
                      trigger={['click']}
                      menu={{
                        items: [
                          {
                            key: 'delete',
                            danger: true,
                            icon: <DeleteOutlined />,
                            label: '删除会话',
                          },
                        ],
                        onClick: ({ key, domEvent }) => {
                          domEvent.stopPropagation()
                          if (key === 'delete') handleDeleteSession(session.id)
                        },
                      }}
                    >
                      <Button
                        type="text"
                        size="small"
                        className="session-sidebar__more-btn"
                        aria-label={`打开 ${session.title} 的更多操作`}
                        icon={<MoreOutlined />}
                        loading={isDeleting}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </Dropdown>
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        {filteredSessions.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={normalizedQuery ? '没有匹配的会话' : '暂无会话，点击上方按钮创建'} className="session-sidebar__empty" />
        ) : null}
      </section>
    </div>
  )
}
