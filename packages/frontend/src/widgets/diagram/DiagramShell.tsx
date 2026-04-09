import { Button, Checkbox, Modal, Space, Typography } from 'antd'
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
  selectChatWorkbenchStreamingConversationIds,
  selectCreatingSession,
  selectCurrentSessionDetail,
  selectCurrentSessionId,
  selectDeletingSessionId,
  selectFocusedConversationId,
  selectHalfPreviewConversationId,
  selectLockedSendConversationId,
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
import { ConversationCanvas, buildTreeLayout } from './ConversationCanvas'
import { SessionSidebar } from './SessionSidebar'

type SidebarMode = 'history' | 'settings'

type DiagramShellProps = {
  onSendError: (content: string) => void
  onRequestError: (error: unknown) => void
  view: 'chat' | 'settings'
}

export function DiagramShell({ onSendError, onRequestError, view }: DiagramShellProps) {
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
  const conversationMessages = useChatWorkbenchStore(selectChatWorkbenchConversationMessages)
  const messagesLoading = useChatWorkbenchStore(selectChatWorkbenchMessagesLoading)
  const messagesError = useChatWorkbenchStore(selectChatWorkbenchMessagesError)
  const conversationNodes = useChatWorkbenchStore(selectChatWorkbenchConversationNodes)
  const streamingConversationIds = useChatWorkbenchStore(selectChatWorkbenchStreamingConversationIds)
  const focusedConversationId = useTreeStore(selectFocusedConversationId)
  const halfPreviewConversationId = useTreeStore(selectHalfPreviewConversationId)
  const lockedSendConversationId = useTreeStore(selectLockedSendConversationId)
  const selectedConversationId = useTreeStore(selectSelectedConversationId)
  const selectSession = useSessionStore((state) => state.selectSession)
  const loadSessionDetail = useSessionStore((state) => state.loadSessionDetail)
  const createSession = useSessionStore((state) => state.createSession)
  const deleteSession = useSessionStore((state) => state.deleteSession)
  const ensureConversationForCurrentSession = useSessionStore((state) => state.ensureConversationForCurrentSession)
  const enterSessionContext = useChatWorkbenchStore((state) => state.enterSessionContext)
  const syncConversationContext = useChatWorkbenchStore((state) => state.syncConversationContext)
  const deleteConversationFromSession = useChatWorkbenchStore((state) => state.deleteConversationFromSession)
  const cascadeDeleteConversationFromSession = useChatWorkbenchStore((state) => state.cascadeDeleteConversationFromSession)
  const updateConversationNodePositions = useChatWorkbenchStore((state) => state.updateConversationNodePositions)
  const persistConversationPositions = useChatWorkbenchStore((state) => state.persistConversationPositions)
  const cancelStreamingConversation = useChatWorkbenchStore((state) => state.cancelStreamingConversation)
  const resetTreeUiState = useTreeStore((state) => state.resetTreeUiState)
  const [peekNav, setPeekNav] = useState(false)
  const [activeSidebar, setActiveSidebar] = useState<SidebarMode | null>(view === 'settings' ? 'settings' : null)

  const isSettingsRoute = location.pathname === '/settings'
  const showWorkspaceHud = settings?.ui && typeof settings.ui === 'object' && 'show_workspace_hud' in settings.ui ? settings.ui.show_workspace_hud !== false : true
  const navExpanded = peekNav || activeSidebar !== null
  const navClassName = activeSidebar
    ? 'diagram-shell__nav diagram-shell__nav--open'
    : navExpanded
      ? 'diagram-shell__nav diagram-shell__nav--peek'
      : 'diagram-shell__nav'

  const selectedConversation = useMemo(
    () => conversationNodes.find((node) => node.conversationId === selectedConversationId) ?? null,
    [conversationNodes, selectedConversationId],
  )
  const lockedSendConversation = useMemo(
    () => conversationNodes.find((node) => node.conversationId === lockedSendConversationId) ?? null,
    [conversationNodes, lockedSendConversationId],
  )
  const focusedConversation = useMemo(
    () => conversationNodes.find((node) => node.conversationId === focusedConversationId) ?? null,
    [conversationNodes, focusedConversationId],
  )
  const halfPreviewConversation = useMemo(
    () => conversationNodes.find((node) => node.conversationId === halfPreviewConversationId) ?? null,
    [conversationNodes, halfPreviewConversationId],
  )
  const viewedConversationId = focusedConversationId ?? halfPreviewConversationId ?? selectedConversationId ?? null
  const sendTargetConversationId = lockedSendConversationId ?? selectedConversationId ?? null
  const hasConversationNodes = conversationNodes.length > 0
  const canCreateConversationOnSend = !hasConversationNodes
  const isStreamingViewedConversation = streamingConversationIds.has(viewedConversationId)

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
        useTreeStore.getState().setLockedSendConversationId(createdConversationId)
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

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      const conversation = conversationNodes.find((node) => node.conversationId === conversationId) ?? null
      const hasChildren = conversationNodes.some((node) => node.parentConversationId === conversationId)
      let cascadeDelete = false

      Modal.confirm({
        title: '确认删除该节点？',
        content: (
          <Space direction="vertical" size={12}>
            <Typography.Text>
              {hasChildren
                ? '删除后无法恢复。未勾选级联删除时，该节点的子对话会保留，并在当前结构下作为根节点显示。'
                : '删除后无法恢复。'}
            </Typography.Text>
            {hasChildren ? (
              <>
                <Checkbox onChange={(event) => {
                  cascadeDelete = event.target.checked
                }}>
                  级联删除子对话
                </Checkbox>
                <Typography.Text type="danger">勾选后将同时删除当前节点及全部子对话。</Typography.Text>
              </>
            ) : null}
          </Space>
        ),
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          if (streamingConversationIds.has(conversationId)) {
            await cancelStreamingConversation()
          }

          const treeState = useTreeStore.getState()
          if (treeState.focusedConversationId === conversationId) {
            treeState.clearFocusedConversationId()
          }
          if (treeState.halfPreviewConversationId === conversationId) {
            treeState.clearHalfPreviewConversationId()
          }
          if (treeState.lockedSendConversationId === conversationId) {
            treeState.clearLockedSendConversationId()
          } else if (treeState.selectedConversationId === conversationId) {
            treeState.clearSelectedConversationId()
          }

          if (cascadeDelete) {
            await cascadeDeleteConversationFromSession(conversationId)
          } else {
            await deleteConversationFromSession(conversationId)
          }

          frontendLogger.info('delete_conversation', {
            extra: {
              conversation_id: conversationId,
              parent_conversation_id: conversation?.parentConversationId ?? null,
              cascade_delete: cascadeDelete,
            },
          })
        },
      })
    },
    [cancelStreamingConversation, cascadeDeleteConversationFromSession, conversationNodes, deleteConversationFromSession, streamingConversationIds],
  )

  const singleMessagePerNode =
    settings?.conversation && typeof settings.conversation === 'object' && 'single_message_per_node' in settings.conversation
      ? settings.conversation.single_message_per_node === true
      : true

  const handleSendMessage = useCallback(
    async (message: string, enableContext: boolean) => {
      try {
        let targetConversationId = sendTargetConversationId

        if (!targetConversationId) {
          if (sessionDetail?.conversations?.length) {
            return
          }

          targetConversationId = await ensureConversationForCurrentSession()
          if (!targetConversationId) {
            return
          }

          useTreeStore.getState().setLockedSendConversationId(targetConversationId)
          if (selectedSessionId) {
            const detail = await loadSessionDetail(selectedSessionId)
            await enterSessionContext(detail)
          }
        }

        const targetConversation = conversationNodes.find((node) => node.conversationId === targetConversationId)
        const targetMessageCount = targetConversation?.messageCount ?? 0

        if (singleMessagePerNode && targetMessageCount >= 1) {
          const childConversationId = await ensureConversationForCurrentSession({ parentConversationId: targetConversationId })
          if (!childConversationId) {
            return
          }

          if (selectedSessionId) {
            const detail = await loadSessionDetail(selectedSessionId)
            await enterSessionContext(detail)
          }

          useTreeStore.getState().setLockedSendConversationId(childConversationId)
          targetConversationId = childConversationId
        }

        await useChatWorkbenchStore.getState().sendMessageToConversation(targetConversationId, message, enableContext, {
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
    [
      ensureConversationForCurrentSession,
      enterSessionContext,
      loadSessionDetail,
      onRequestError,
      onSendError,
      selectedSessionId,
      sendTargetConversationId,
      sessionDetail,
      conversationNodes,
      singleMessagePerNode,
    ],
  )

  const handleStopMessage = useCallback(async () => {
    try {
      await cancelStreamingConversation()
    } catch (caughtError) {
      onRequestError(caughtError)
    }
  }, [cancelStreamingConversation, onRequestError])

  const handleAutoArrange = useCallback(async () => {
    if (!selectedSessionId || conversationNodes.length === 0) {
      return
    }

    const positions = buildTreeLayout(conversationNodes)

    const arranged = conversationNodes.map((conversation) => {
      const pos = positions.get(conversation.conversationId) ?? { x: 0, y: 0 }
      return {
        conversationId: conversation.conversationId,
        position: pos,
      }
    })

    try {
      updateConversationNodePositions(arranged)
      await persistConversationPositions(selectedSessionId, arranged)
      frontendLogger.info('auto_arrange_conversations', {
        extra: {
          session_id: selectedSessionId,
          conversation_count: arranged.length,
        },
      })
    } catch (caughtError) {
      onRequestError(caughtError)
    }
  }, [conversationNodes, onRequestError, persistConversationPositions, selectedSessionId, updateConversationNodePositions])

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
    <section className="diagram-shell">
      <div className="diagram-shell__canvas-layer">
        <ConversationCanvas
          currentSessionId={selectedSessionId}
          focusedConversationId={focusedConversationId}
          halfPreviewConversationId={halfPreviewConversationId}
          selectedConversationId={selectedConversationId}
          lockedSendConversationId={lockedSendConversationId}
          sessionDetail={sessionDetail}
          conversationDetail={conversationDetail}
          conversationNodes={conversationNodes}
          conversationMessages={conversationMessages}
          messagesLoading={messagesLoading}
          messagesError={messagesError}
          sending={isStreamingViewedConversation}
          canCreateConversationOnSend={canCreateConversationOnSend}
          onSendMessage={handleSendMessage}
          onStopMessage={handleStopMessage}
          onCreateConversation={handleCreateConversation}
          onDeleteConversation={handleDeleteConversation}
          onAutoArrange={handleAutoArrange}
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
          <div className="diagram-shell__nav-head">
            <div className="diagram-shell__nav-trigger-slot">
              <Button
                type="text"
                shape="round"
                className="diagram-shell__nav-trigger"
                aria-label="展开或收起图侧边栏"
                aria-expanded={navExpanded}
                onClick={collapseNav}
              >
                WB
              </Button>
            </div>

            <div className="diagram-shell__nav-actions-slot">
              <div className={navExpanded ? 'diagram-shell__nav-actions diagram-shell__nav-actions--visible' : 'diagram-shell__nav-actions'}>
                <Button
                  className={activeSidebar === 'history' ? 'diagram-shell__nav-button diagram-shell__nav-button--active' : 'diagram-shell__nav-button'}
                  onClick={() => openSidebar('history')}
                >
                  会话历史
                </Button>
                <Button
                  className={activeSidebar === 'settings' ? 'diagram-shell__nav-button diagram-shell__nav-button--active' : 'diagram-shell__nav-button'}
                  onClick={() => openSidebar('settings')}
                >
                  设置
                </Button>
              </div>
            </div>
          </div>

          <div className={activeSidebar ? 'diagram-shell__nav-body diagram-shell__nav-body--visible' : 'diagram-shell__nav-body'}>
            <div className="diagram-shell__nav-panel">
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
                <div className="diagram-shell__settings">
                  <SettingsPage embedded />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {showWorkspaceHud ? (
          <div className="diagram-shell__hud">
            <Space direction="vertical" size={8}>
              <Typography.Text className="diagram-shell__eyebrow">WorkBranch Diagram</Typography.Text>
              <Space align="start" size={12} wrap>
                <Typography.Title level={3} className="diagram-shell__title">
                  {isSettingsRoute
                    ? '系统设置'
                    : focusedConversation
                      ? `对话 ${focusedConversation.conversationId}`
                      : halfPreviewConversation
                        ? `对话 ${halfPreviewConversation.conversationId}`
                        : sessionDetail
                          ? `会话 ${sessionDetail.title}`
                          : '当前暂无会话'}
                </Typography.Title>
              </Space>
              <Space wrap>
                {sessionDetail && !isSettingsRoute ? <StatusTag label={`会话 ${sessionDetail.title}`} tone="default" /> : null}
                <StatusTag label="阶段十二" tone="processing" />
                <StatusTag label={isSettingsRoute ? '侧边栏设置' : '对话图'} tone="success" />
                <StatusTag
                  label={focusedConversationId ? '聚焦态' : halfPreviewConversationId ? '半预览态' : '概览态'}
                  tone={focusedConversationId ? 'warning' : halfPreviewConversationId ? 'processing' : 'default'}
                />
                {(lockedSendConversation || selectedConversation) ? (
                  <Space wrap size={6}>
                    <Typography.Text>当前目标对话</Typography.Text>
                    <StatusTag
                      label={(lockedSendConversation ?? (selectedConversation as NonNullable<typeof selectedConversation>)).conversationId}
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
