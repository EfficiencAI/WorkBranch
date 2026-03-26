import { Button, Space, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { UserProfile } from '../../entities'
import {
  selectChatWorkbenchConversationDetail,
  selectChatWorkbenchNodes,
  selectChatWorkbenchSelectedSessionId,
  selectChatWorkbenchSessionDetail,
  selectChatWorkbenchSessions,
  selectChatWorkbenchStreaming,
  selectChatWorkbenchWorkspaceDetail,
  useChatWorkbenchStore,
} from '../../features'
import { StatusTag } from '../../shared/ui'
import { SettingsPage } from '../../pages/settings/SettingsPage'
import { ConversationCanvas } from './ConversationCanvas'
import { DetailPanel } from './DetailPanel'
import { SessionSidebar } from './SessionSidebar'

type SidebarMode = 'history' | 'settings'

type WorkspaceShellProps = {
  user: UserProfile
  onSendError: (content: string) => void
  onRequestError: (error: unknown) => void
  view: 'chat' | 'settings'
}

export function WorkspaceShell({ user, onSendError, onRequestError, view }: WorkspaceShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const sessions = useChatWorkbenchStore(selectChatWorkbenchSessions)
  const selectedSessionId = useChatWorkbenchStore(selectChatWorkbenchSelectedSessionId)
  const sessionDetail = useChatWorkbenchStore(selectChatWorkbenchSessionDetail)
  const conversationDetail = useChatWorkbenchStore(selectChatWorkbenchConversationDetail)
  const workspaceDetail = useChatWorkbenchStore(selectChatWorkbenchWorkspaceDetail)
  const nodes = useChatWorkbenchStore(selectChatWorkbenchNodes)
  const sending = useChatWorkbenchStore(selectChatWorkbenchStreaming)
  const selectSession = useChatWorkbenchStore((state) => state.selectSession)
  const sendMessage = useChatWorkbenchStore((state) => state.sendMessage)
  const [peekNav, setPeekNav] = useState(false)
  const [activeSidebar, setActiveSidebar] = useState<SidebarMode | null>(view === 'settings' ? 'settings' : null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)

  const isSettingsRoute = location.pathname === '/settings'
  const navExpanded = peekNav || activeSidebar !== null
  const navClassName = activeSidebar
    ? 'workspace-shell__nav workspace-shell__nav--open'
    : navExpanded
      ? 'workspace-shell__nav workspace-shell__nav--peek'
      : 'workspace-shell__nav'

  function collapseNav() {
    setPeekNav(false)
    setActiveSidebar(null)

    if (isSettingsRoute) {
      navigate('/chat')
    }
  }

  function openSidebar(mode: SidebarMode) {
    setFocusedNodeId(null)
    setPeekNav(true)
    setActiveSidebar(mode)

    if (mode === 'settings' && !isSettingsRoute) {
      navigate('/settings')
      return
    }

    if (mode === 'history' && isSettingsRoute) {
      navigate('/chat')
    }
  }

  function focusNode(nodeId: string) {
    setFocusedNodeId(nodeId)
    setActiveSidebar(null)

    if (isSettingsRoute) {
      navigate('/chat')
    }
  }

  const handleSelectSession = useCallback(
    (sessionId: string | number) => {
      void selectSession(sessionId)
    },
    [selectSession],
  )

  const handleSendMessage = useCallback(
    async (message: string) => {
      try {
        await sendMessage(message, {
          onStreamError(event) {
            if (event.content) {
              onSendError(String(event.content))
            }
          },
        })
      } catch (caughtError) {
        onRequestError(caughtError)
      }
    },
    [onRequestError, onSendError, sendMessage],
  )

  return (
    <section className="workspace-shell">
      <div className="workspace-shell__canvas-layer">
        <ConversationCanvas
          focusedNodeId={focusedNodeId}
          onFocusNode={focusNode}
          conversationDetail={conversationDetail}
          workspaceDetail={workspaceDetail}
          nodes={nodes}
          sending={sending}
          onSendMessage={handleSendMessage}
        />

        <div
          className={navClassName}
          onMouseEnter={() => {
            if (!activeSidebar) {
              setPeekNav(true)
            }
          }}
          onMouseLeave={() => {
            if (!activeSidebar) {
              setPeekNav(false)
            }
          }}
        >
          <div className="workspace-shell__nav-head">
            <div className="workspace-shell__nav-trigger-slot">
              <Button
                type="text"
                shape="round"
                className="workspace-shell__nav-trigger"
                aria-label="展开或收起工作台侧边栏"
                aria-expanded={navExpanded}
                onClick={collapseNav}
              >
                WB
              </Button>
            </div>

            <div className="workspace-shell__nav-actions-slot">
              <div className={navExpanded ? 'workspace-shell__nav-actions workspace-shell__nav-actions--visible' : 'workspace-shell__nav-actions'}>
                <Button
                  className={activeSidebar === 'history' ? 'workspace-shell__nav-button workspace-shell__nav-button--active' : 'workspace-shell__nav-button'}
                  onClick={() => openSidebar('history')}
                >
                  会话历史
                </Button>
                <Button
                  className={activeSidebar === 'settings' ? 'workspace-shell__nav-button workspace-shell__nav-button--active' : 'workspace-shell__nav-button'}
                  onClick={() => openSidebar('settings')}
                >
                  设置
                </Button>
              </div>
            </div>
          </div>

          <div className={activeSidebar ? 'workspace-shell__nav-body workspace-shell__nav-body--visible' : 'workspace-shell__nav-body'}>
            <div className="workspace-shell__nav-panel">
              {activeSidebar === 'history' ? (
                <SessionSidebar
                  user={user}
                  sessions={sessions}
                  selectedSessionId={selectedSessionId}
                  onSelectSession={handleSelectSession}
                />
              ) : null}

              {activeSidebar === 'settings' ? (
                <div className="workspace-shell__settings">
                  <SettingsPage embedded />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="workspace-shell__hud">
          <Space direction="vertical" size={8}>
            <Typography.Text className="workspace-shell__eyebrow">WorkBranch Workspace</Typography.Text>
            <Typography.Title level={3} className="workspace-shell__title">
              {isSettingsRoute
                ? '系统设置'
                : conversationDetail?.conversationId
                  ? `对话 ${conversationDetail.conversationId}`
                  : '当前暂无活跃对话'}
            </Typography.Title>
            <Space wrap>
              {sessionDetail && !isSettingsRoute ? <StatusTag label={`会话 ${sessionDetail.title}`} tone="default" /> : null}
              <StatusTag label="阶段五" tone="processing" />
              <StatusTag label={isSettingsRoute ? '侧边栏设置' : '全屏会话图'} tone="success" />
              <StatusTag label={conversationDetail ? '真实数据' : '空状态'} tone="warning" />
            </Space>
          </Space>
        </div>
      </div>

      {focusedNodeId ? (
        <button
          type="button"
          className="workspace-shell__scrim workspace-shell__scrim--detail"
          aria-label="关闭节点聚焦详情"
          onClick={() => setFocusedNodeId(null)}
        />
      ) : null}

      {focusedNodeId && conversationDetail && sessionDetail ? (
        <DetailPanel
          nodeId={focusedNodeId}
          onClose={() => setFocusedNodeId(null)}
          nodes={nodes}
          conversationDetail={conversationDetail}
          sessionDetail={sessionDetail}
          workspaceDetail={workspaceDetail}
        />
      ) : null}
    </section>
  )
}
