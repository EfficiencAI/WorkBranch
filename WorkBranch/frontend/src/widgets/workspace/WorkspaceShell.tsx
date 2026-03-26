import { Button, Space, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { ConversationCanvas } from './ConversationCanvas'
import { DetailPanel } from './DetailPanel'
import { SessionSidebar } from './SessionSidebar'

type SidebarMode = 'history' | 'settings'

type WorkspaceShellProps = {
  user: UserProfile
  onSendError: (content: string) => void
  onRequestError: (error: unknown) => void
}

export function WorkspaceShell({ user, onSendError, onRequestError }: WorkspaceShellProps) {
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
  const [activeSidebar, setActiveSidebar] = useState<SidebarMode | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)

  const navExpanded = peekNav || activeSidebar !== null
  const navClassName = activeSidebar
    ? 'workspace-shell__nav workspace-shell__nav--open'
    : navExpanded
      ? 'workspace-shell__nav workspace-shell__nav--peek'
      : 'workspace-shell__nav'

  function collapseNav() {
    setPeekNav(false)
    setActiveSidebar(null)
  }

  function closeWorkspaceLayers() {
    setActiveSidebar(null)
    setFocusedNodeId(null)
    setPeekNav(true)
  }

  function openSidebar(mode: SidebarMode) {
    setActiveSidebar(mode)
    setFocusedNodeId(null)
    setPeekNav(true)
  }

  function focusNode(nodeId: string) {
    setFocusedNodeId(nodeId)
    setActiveSidebar(null)
  }

  const handleSelectSession = useCallback((sessionId: string | number) => {
    void selectSession(sessionId)
  }, [selectSession])

  const handleSendMessage = useCallback(async (message: string) => {
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
  }, [onRequestError, onSendError, sendMessage])

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
          onMouseEnter={() => setPeekNav(true)}
          onMouseLeave={() => {
            if (!activeSidebar) {
              setPeekNav(false)
            }
          }}
        >
          <div className="workspace-shell__nav-head">
            <Button
              type="primary"
              shape="round"
              className="workspace-shell__nav-trigger"
              aria-label="展开或收起工作台侧边栏"
              aria-expanded={navExpanded}
              onClick={collapseNav}
            >
              WB
            </Button>

            <div className={navExpanded ? 'workspace-shell__nav-actions workspace-shell__nav-actions--visible' : 'workspace-shell__nav-actions'}>
              <Button className="workspace-shell__nav-button" onClick={closeWorkspaceLayers}>
                工作台
              </Button>
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

          <div className={activeSidebar ? 'workspace-shell__nav-body workspace-shell__nav-body--visible' : 'workspace-shell__nav-body'}>
            {activeSidebar ? (
              <SessionSidebar
                mode={activeSidebar}
                user={user}
                sessions={sessions}
                selectedSessionId={selectedSessionId}
                onSelectSession={handleSelectSession}
                onOpenSettingsPage={() => navigate('/settings')}
              />
            ) : null}
          </div>
        </div>

        <div className="workspace-shell__hud">
          <Space direction="vertical" size={8}>
            <Typography.Text className="workspace-shell__eyebrow">WorkBranch Workspace</Typography.Text>
            <Typography.Title level={3} className="workspace-shell__title">
              {conversationDetail?.conversationId ? `对话 ${conversationDetail.conversationId}` : '当前暂无活跃对话'}
            </Typography.Title>
            <Space wrap>
              {sessionDetail ? <StatusTag label={`会话 ${sessionDetail.title}`} tone="default" /> : null}
              <StatusTag label="阶段五" tone="processing" />
              <StatusTag label="全屏会话图" tone="success" />
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
