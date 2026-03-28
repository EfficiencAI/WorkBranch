import { Button, Space, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { SessionId } from '../../entities'
import {
  createConversationForCurrentSession,
  selectChatWorkbenchConversationDetail,
  selectChatWorkbenchNodes,
  selectChatWorkbenchStreaming,
  selectChatWorkbenchWorkspaceDetail,
  selectCreatingSession,
  selectCurrentSessionDetail,
  selectCurrentSessionId,
  selectDeletingSessionId,
  selectSessionList,
  selectUserProfile,
  setActiveConversationForSession,
  useChatWorkbenchStore,
  useSessionStore,
  useUserStore,
} from '../../features'
import { SettingsPage } from '../../pages/settings/SettingsPage'
import { StatusTag } from '../../shared/ui'
import { ConversationCanvas } from './ConversationCanvas'
import { DetailPanel } from './DetailPanel'
import { SessionSidebar } from './SessionSidebar'

type SidebarMode = 'history' | 'settings'

type WorkspaceShellProps = {
  onSendError: (content: string) => void
  onRequestError: (error: unknown) => void
  view: 'chat' | 'settings'
}

export function WorkspaceShell({ onSendError, onRequestError, view }: WorkspaceShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const sessions = useSessionStore(selectSessionList)
  const selectedSessionId = useSessionStore(selectCurrentSessionId)
  const sessionDetail = useSessionStore(selectCurrentSessionDetail)
  const creatingSession = useSessionStore(selectCreatingSession)
  const deletingSessionId = useSessionStore(selectDeletingSessionId)
  const user = useUserStore(selectUserProfile)
  const conversationDetail = useChatWorkbenchStore(selectChatWorkbenchConversationDetail)
  const workspaceDetail = useChatWorkbenchStore(selectChatWorkbenchWorkspaceDetail)
  const nodes = useChatWorkbenchStore(selectChatWorkbenchNodes)
  const sending = useChatWorkbenchStore(selectChatWorkbenchStreaming)
  const selectSession = useSessionStore((state) => state.selectSession)
  const loadSessionDetail = useSessionStore((state) => state.loadSessionDetail)
  const createSession = useSessionStore((state) => state.createSession)
  const deleteSession = useSessionStore((state) => state.deleteSession)
  const enterSessionContext = useChatWorkbenchStore((state) => state.enterSessionContext)
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

  const runSessionContext = useCallback(
    async (detail: Awaited<ReturnType<typeof selectSession>>) => {
      const result = await enterSessionContext(detail)

      if (result === 'invalid-active-conversation' && detail) {
        await setActiveConversationForSession(detail.id, null)
      }
    },
    [enterSessionContext],
  )

  const handleCreateConversation = useCallback(async () => {
    try {
      await createConversationForCurrentSession()
      setFocusedNodeId(null)

      if (selectedSessionId) {
        await loadSessionDetail(selectedSessionId)
      }
    } catch (caughtError) {
      onRequestError(caughtError)
    }
  }, [loadSessionDetail, onRequestError, selectedSessionId])

  const handleSelectSession = useCallback(
    async (sessionId: SessionId) => {
      setFocusedNodeId(null)
      const detail = await selectSession(sessionId)
      await runSessionContext(detail)
    },
    [runSessionContext, selectSession],
  )

  const handleCreateSession = useCallback(async () => {
    try {
      setFocusedNodeId(null)
      const detail = await createSession()
      await runSessionContext(detail)
    } catch (caughtError) {
      onRequestError(caughtError)
    }
  }, [createSession, onRequestError, runSessionContext])

  const handleDeleteSession = useCallback(
    async (sessionId: SessionId) => {
      try {
        setFocusedNodeId(null)
        const detail = await deleteSession(sessionId)
        await runSessionContext(detail)
      } catch (caughtError) {
        onRequestError(caughtError)
      }
    },
    [deleteSession, onRequestError, runSessionContext],
  )

  const handleSendMessage = useCallback(
    async (message: string) => {
      try {
        await useChatWorkbenchStore.getState().sendMessage(message, {
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
    [onRequestError, onSendError],
  )

  const handleEnterConversationFocus = useCallback(
    async (conversationId: string) => {
      if (!selectedSessionId) {
        return
      }

      try {
        setFocusedNodeId(null)
        await setActiveConversationForSession(selectedSessionId, conversationId)
      } catch (caughtError) {
        onRequestError(caughtError)
      }
    },
    [onRequestError, selectedSessionId],
  )

  const handleReturnToOverview = useCallback(async () => {
    if (!selectedSessionId || !sessionDetail?.activeConversationId) {
      setFocusedNodeId(null)
      return
    }

    try {
      setFocusedNodeId(null)
      await setActiveConversationForSession(selectedSessionId, null)
    } catch (caughtError) {
      onRequestError(caughtError)
    }
  }, [onRequestError, selectedSessionId, sessionDetail?.activeConversationId])

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

  function focusNode(nodeId: string | null) {
    setFocusedNodeId(nodeId)
    setActiveSidebar(null)

    if (isSettingsRoute) {
      navigate('/chat')
    }
  }

  return (
    <section className="workspace-shell">
      <div className="workspace-shell__canvas-layer">
        <ConversationCanvas
          currentSessionId={selectedSessionId}
          activeConversationId={sessionDetail?.activeConversationId ?? null}
          focusedNodeId={focusedNodeId}
          onFocusNode={focusNode}
          onEnterConversationFocus={handleEnterConversationFocus}
          onExitConversationFocus={handleReturnToOverview}
          conversationDetail={conversationDetail}
          sessionDetail={sessionDetail}
          workspaceDetail={workspaceDetail}
          nodes={nodes}
          sending={sending}
          onSendMessage={handleSendMessage}
          onCreateConversation={handleCreateConversation}
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
              {activeSidebar === 'history' && user ? (
                <SessionSidebar
                  user={user}
                  sessions={sessions}
                  selectedSessionId={selectedSessionId}
                  creatingSession={creatingSession}
                  deletingSessionId={deletingSessionId}
                  onCreateSession={handleCreateSession}
                  onDeleteSession={handleDeleteSession}
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
            <Space align="start" size={12}>
              <Typography.Title level={3} className="workspace-shell__title">
                {isSettingsRoute
                  ? '系统设置'
                  : conversationDetail?.conversationId
                    ? `对话 ${conversationDetail.conversationId}`
                    : '当前暂无活跃对话'}
              </Typography.Title>
              {!isSettingsRoute && sessionDetail?.activeConversationId ? (
                <Button size="small" onClick={() => void handleReturnToOverview()}>
                  返回概览
                </Button>
              ) : null}
            </Space>
            <Space wrap>
              {sessionDetail && !isSettingsRoute ? <StatusTag label={`会话 ${sessionDetail.title}`} tone="default" /> : null}
              <StatusTag label="阶段九C" tone="processing" />
              <StatusTag label={isSettingsRoute ? '侧边栏设置' : '全屏会话图'} tone="success" />
              <StatusTag label={conversationDetail ? '真实数据' : '空状态'} tone="warning" />
            </Space>
          </Space>
        </div>
      </div>

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
