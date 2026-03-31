import { Button, Space, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSettings } from '../../app/settings'
import type { SessionId } from '../../entities'
import {
  selectChatWorkbenchConversationDetail,
  selectChatWorkbenchConversationMessages,
  selectChatWorkbenchConversationNodes,
  selectChatWorkbenchMessagesError,
  selectChatWorkbenchMessagesLoading,
  selectChatWorkbenchStreamingConversationId,
  selectChatWorkbenchWorkspaceDetail,
  selectCreatingSession,
  selectCurrentSessionDetail,
  selectCurrentSessionId,
  selectDeletingSessionId,
  selectFocusedConversationId,
  selectSelectedConversationId,
  selectSessionList,
  selectUserProfile,
  useChatWorkbenchStore,
  useSessionStore,
  useTreeStore,
  useUserStore,
} from '../../features'
import { SettingsPage } from '../../pages/settings/SettingsPage'
import { frontendLogger } from '../../shared/logging/logger'
import { StatusTag } from '../../shared/ui'
import { ConversationCanvas } from './ConversationCanvas'
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
  const { settings } = useSettings()
  const sessions = useSessionStore(selectSessionList)
  const selectedSessionId = useSessionStore(selectCurrentSessionId)
  const sessionDetail = useSessionStore(selectCurrentSessionDetail)
  const creatingSession = useSessionStore(selectCreatingSession)
  const deletingSessionId = useSessionStore(selectDeletingSessionId)
  const user = useUserStore(selectUserProfile)
  const conversationDetail = useChatWorkbenchStore(selectChatWorkbenchConversationDetail)
  const workspaceDetail = useChatWorkbenchStore(selectChatWorkbenchWorkspaceDetail)
  const conversationMessages = useChatWorkbenchStore(selectChatWorkbenchConversationMessages)
  const messagesLoading = useChatWorkbenchStore(selectChatWorkbenchMessagesLoading)
  const messagesError = useChatWorkbenchStore(selectChatWorkbenchMessagesError)
  const conversationNodes = useChatWorkbenchStore(selectChatWorkbenchConversationNodes)
  const streamingConversationId = useChatWorkbenchStore(selectChatWorkbenchStreamingConversationId)
  const focusedConversationId = useTreeStore(selectFocusedConversationId)
  const selectedConversationId = useTreeStore(selectSelectedConversationId)
  const selectSession = useSessionStore((state) => state.selectSession)
  const loadSessionDetail = useSessionStore((state) => state.loadSessionDetail)
  const createSession = useSessionStore((state) => state.createSession)
  const deleteSession = useSessionStore((state) => state.deleteSession)
  const ensureConversationForCurrentSession = useSessionStore((state) => state.ensureConversationForCurrentSession)
  const enterSessionContext = useChatWorkbenchStore((state) => state.enterSessionContext)
  const syncConversationContext = useChatWorkbenchStore((state) => state.syncConversationContext)
  const cancelStreamingConversation = useChatWorkbenchStore((state) => state.cancelStreamingConversation)
  const resetTreeUiState = useTreeStore((state) => state.resetTreeUiState)
  const [peekNav, setPeekNav] = useState(false)
  const [activeSidebar, setActiveSidebar] = useState<SidebarMode | null>(view === 'settings' ? 'settings' : null)

  const isSettingsRoute = location.pathname === '/settings'
  const showWorkspaceHud = settings?.ui && typeof settings.ui === 'object' && 'show_workspace_hud' in settings.ui ? settings.ui.show_workspace_hud !== false : true
  const navExpanded = peekNav || activeSidebar !== null
  const navClassName = activeSidebar
    ? 'workspace-shell__nav workspace-shell__nav--open'
    : navExpanded
      ? 'workspace-shell__nav workspace-shell__nav--peek'
      : 'workspace-shell__nav'

  const selectedConversation = useMemo(
    () => conversationNodes.find((node) => node.conversationId === selectedConversationId) ?? null,
    [conversationNodes, selectedConversationId],
  )
  const focusedConversation = useMemo(
    () => conversationNodes.find((node) => node.conversationId === focusedConversationId) ?? null,
    [conversationNodes, focusedConversationId],
  )
  const viewedConversationId = focusedConversationId ?? selectedConversationId ?? null
  const hasConversationNodes = conversationNodes.length > 0
  const canCreateConversationOnSend = !hasConversationNodes
  const isStreamingViewedConversation = Boolean(streamingConversationId && streamingConversationId === viewedConversationId)

  useEffect(() => {
    void syncConversationContext(viewedConversationId)
  }, [syncConversationContext, viewedConversationId])

  const runSessionContext = useCallback(
    async (detail: Awaited<ReturnType<typeof selectSession>>) => {
      resetTreeUiState()
      await enterSessionContext(detail)
    },
    [enterSessionContext, resetTreeUiState],
  )

  const handleCreateConversation = useCallback(
    async (parentConversationId: string | null) => {
      try {
        const createdConversationId = await ensureConversationForCurrentSession({ parentConversationId })

        if (!createdConversationId) {
          return
        }

        if (selectedSessionId) {
          const detail = await loadSessionDetail(selectedSessionId)
          await enterSessionContext(detail)
        }

        frontendLogger.info('create_conversation', {
          extra: {
            conversation_id: createdConversationId,
            parent_conversation_id: parentConversationId,
          },
        })

        useTreeStore.getState().setFocusedConversationId(null)
        useTreeStore.getState().setSelectedConversationId(createdConversationId)
      } catch (caughtError) {
        console.error('[handleCreateConversation] error:', caughtError)
        onRequestError(caughtError)
      }
    },
    [ensureConversationForCurrentSession, enterSessionContext, loadSessionDetail, onRequestError, selectedSessionId],
  )

  const handleSelectSession = useCallback(
    async (sessionId: SessionId) => {
      const detail = await selectSession(sessionId)
      await runSessionContext(detail)
    },
    [runSessionContext, selectSession],
  )

  const handleCreateSession = useCallback(async () => {
    try {
      const detail = await createSession()
      await runSessionContext(detail)
    } catch (caughtError) {
      onRequestError(caughtError)
    }
  }, [createSession, onRequestError, runSessionContext])

  const handleDeleteSession = useCallback(
    async (sessionId: SessionId) => {
      try {
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
        let targetConversationId = focusedConversationId ?? selectedConversationId ?? null

        if (!targetConversationId) {
          if (sessionDetail?.conversations?.length) {
            return
          }

          targetConversationId = await ensureConversationForCurrentSession()
          if (!targetConversationId) {
            return
          }

          useTreeStore.getState().setSelectedConversationId(targetConversationId)
          if (selectedSessionId) {
            const detail = await loadSessionDetail(selectedSessionId)
            await enterSessionContext(detail)
          }
        }

        await useChatWorkbenchStore.getState().sendMessageToConversation(targetConversationId, message, {
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
    [ensureConversationForCurrentSession, enterSessionContext, focusedConversationId, loadSessionDetail, onRequestError, onSendError, selectedConversationId, selectedSessionId, sessionDetail],
  )

  const handleStopMessage = useCallback(async () => {
    try {
      await cancelStreamingConversation()
    } catch (caughtError) {
      onRequestError(caughtError)
    }
  }, [cancelStreamingConversation, onRequestError])

  function collapseNav() {
    setPeekNav(false)
    setActiveSidebar(null)

    if (isSettingsRoute) {
      navigate('/chat')
    }
  }

  function openSidebar(mode: SidebarMode) {
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

  return (
    <section className="workspace-shell">
      <div className="workspace-shell__canvas-layer">
        <ConversationCanvas
          currentSessionId={selectedSessionId}
          focusedConversationId={focusedConversationId}
          selectedConversationId={selectedConversationId}
          sessionDetail={sessionDetail}
          conversationDetail={conversationDetail}
          workspaceDetail={workspaceDetail}
          conversationNodes={conversationNodes}
          conversationMessages={conversationMessages}
          messagesLoading={messagesLoading}
          messagesError={messagesError}
          sending={isStreamingViewedConversation}
          canCreateConversationOnSend={canCreateConversationOnSend}
          onSendMessage={handleSendMessage}
          onStopMessage={handleStopMessage}
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

        {showWorkspaceHud ? (
          <div className="workspace-shell__hud">
            <Space direction="vertical" size={8}>
              <Typography.Text className="workspace-shell__eyebrow">WorkBranch Workspace</Typography.Text>
              <Space align="start" size={12} wrap>
                <Typography.Title level={3} className="workspace-shell__title">
                  {isSettingsRoute
                    ? '系统设置'
                    : focusedConversation
                      ? `对话 ${focusedConversation.conversationId}`
                      : sessionDetail
                        ? `会话 ${sessionDetail.title}`
                        : '当前暂无会话'}
                </Typography.Title>
              </Space>
              <Space wrap>
                {sessionDetail && !isSettingsRoute ? <StatusTag label={`会话 ${sessionDetail.title}`} tone="default" /> : null}
                <StatusTag label="阶段十二" tone="processing" />
                <StatusTag label={isSettingsRoute ? '侧边栏设置' : '对话树工作台'} tone="success" />
                <StatusTag label={focusedConversationId ? '聚焦态' : '概览态'} tone={focusedConversationId ? 'warning' : 'default'} />
                {(focusedConversation || selectedConversation) ? (
                  <Space wrap size={6}>
                    <Typography.Text>当前目标对话</Typography.Text>
                    <StatusTag
                      label={focusedConversation ? focusedConversation.conversationId : (selectedConversation as NonNullable<typeof selectedConversation>).conversationId}
                      tone="processing"
                    />
                  </Space>
                ) : (
                  <Typography.Text type="secondary">当前目标对话</Typography.Text>
                )}
              </Space>
            </Space>
          </div>
        ) : null}
      </div>
    </section>
  )
}
