import { Button, Checkbox, Drawer, Modal, Space, Typography } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSettings } from '../../app/settings'
import { useOnboarding } from '../../app/onboarding'
import type { SessionId } from '../../entities'
import {
  selectChatWorkbenchConversationDetail,
  selectChatWorkbenchConversationMessages,
  selectChatWorkbenchConversationNodes,
  selectChatWorkbenchWorkspaceDetail,
  selectChatWorkbenchMessagesError,
  selectChatWorkbenchMessagesLoading,
  selectChatWorkbenchStreamingConversationIds,
  selectCreatingSession,
  selectCurrentSessionDetail,
  selectCurrentSessionId,
  selectDeletingSessionId,
  selectFocusedConversationId,
  selectLockedSendConversationId,
  selectSelectedConversationId,
  selectSessionList,
  selectUserProfile,
  useChatWorkbenchStore,
  useSessionStore,
  useTreeStore,
  useUserStore,
} from '../../features'
import type { AgentId } from '../../shared/api'
import { SettingsPage } from '../../pages/settings/SettingsPage'
import { useResponsive } from '../../shared/lib'
import { frontendLogger } from '../../shared/logging/logger'
import { StatusTag } from '../../shared/ui'
import { ConversationCanvas, buildTreeLayout } from './ConversationCanvas'
import { SessionSidebar } from './SessionSidebar'

type SidebarMode = 'history' | 'settings'

type DiagramShellProps = {
  onSendError: (content: string) => void
  onRequestError: (error: unknown) => void
  view: 'chat' | 'settings'
  initialLoading?: boolean
}

export function DiagramShell({ onSendError, onRequestError, view, initialLoading }: DiagramShellProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { settings } = useSettings()
  const { showOnboarding } = useOnboarding()
  const responsive = useResponsive()
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
  const streamingConversationIds = useChatWorkbenchStore(selectChatWorkbenchStreamingConversationIds)
  const focusedConversationId = useTreeStore(selectFocusedConversationId)
  const lockedSendConversationId = useTreeStore(selectLockedSendConversationId)
  const selectedConversationId = useTreeStore(selectSelectedConversationId)
  const selectSession = useSessionStore((state) => state.selectSession)
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
  const [activeSidebar, setActiveSidebar] = useState<SidebarMode | null>(view === 'settings' ? 'settings' : null)
  const [navPathTailId, setNavPathTailId] = useState<string | null>(null)
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>('trae')

  const isSettingsRoute = location.pathname === '/settings'
  const showWorkspaceHud = settings?.ui && typeof settings.ui === 'object' && 'show_workspace_hud' in settings.ui ? settings.ui.show_workspace_hud !== false : true
  const isFocused = focusedConversationId !== null
  const setFocusedConversationId = useTreeStore((state) => state.setFocusedConversationId)
  const navClassName = [
    'diagram-shell__nav',
    responsive.isMobile ? 'diagram-shell__nav--mobile' : null,
    isFocused ? 'diagram-shell__nav--focused' : null,
  ].filter(Boolean).join(' ')

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
  const viewedConversationId = focusedConversationId ?? selectedConversationId ?? null
  const sendTargetConversationId = lockedSendConversationId ?? selectedConversationId ?? navPathTailId ?? null
  const hasConversationNodes = conversationNodes.length > 0
  const canCreateConversationOnSend = !hasConversationNodes
  const isStreamingViewedConversation = viewedConversationId !== null && streamingConversationIds.has(viewedConversationId)

  useEffect(() => {
    const agentSettings = settings?.agent
    if (!agentSettings || typeof agentSettings !== 'object' || Array.isArray(agentSettings)) {
      return
    }
    const defaultAgent = (agentSettings as Record<string, unknown>).default_agent
    setSelectedAgentId(defaultAgent === 'trae' ? 'trae' : 'builtin')
  }, [settings])

  function confirmTraeRun(): Promise<boolean> {
    return new Promise((resolve) => {
      Modal.confirm({
        title: '确认运行 Trae CLI？',
        content: (
          <Space direction="vertical" size={8}>
            <Typography.Text>Trae CLI 可能修改工作区文件。</Typography.Text>
            <Typography.Text type="secondary">
              working dir: {workspaceDetail?.dir ?? conversationDetail?.workspaceId ?? '当前会话工作区'}
            </Typography.Text>
          </Space>
        ),
        okText: '确认运行',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      })
    })
  }

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
        const result = await ensureConversationForCurrentSession({ parentConversationId })

        if (!result) {
          return
        }

        const { conversationId: createdConversationId, detail } = result

        // 与 handleSelectSession 路径一致：先重置 tree UI 再进入上下文。
        // 直接使用 ensureConversationForCurrentSession 返回的已加载 detail，
        // 不再从 store 间接读取，避免并发更新导致读到过期值。
        await runSessionContext(detail)

        frontendLogger.info('create_conversation', {
          extra: {
            conversation_id: createdConversationId,
            parent_conversation_id: parentConversationId,
          },
        })

        useTreeStore.getState().setFocusedConversationId(null)
        useTreeStore.getState().setLockedSendConversationId(createdConversationId)
      } catch (caughtError) {
        onRequestError(caughtError)
      }
    },
    [ensureConversationForCurrentSession, runSessionContext, onRequestError],
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
      // 新创建的 session 还没有对话，conversations=[]。
      // 此时调用 enterSessionContext 会因 !summaries.length 立即 resetConversationState，
      // 属于无效操作。延迟到创建对话后再统一进入上下文。
      if (detail && detail.conversations && detail.conversations.length > 0) {
        await runSessionContext(detail)
      }
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
        if (selectedAgentId === 'builtin') {
          const llm = settings?.llm
          if (!llm || typeof llm !== 'object' || Array.isArray(llm)) {
            showOnboarding()
            return
          }
          const llmConfig = llm as Record<string, unknown>
          if (!llmConfig.api_key || !llmConfig.base_url || !llmConfig.model) {
            showOnboarding()
            return
          }
        }

        let targetConversationId = sendTargetConversationId

        if (!targetConversationId) {
          if (sessionDetail?.conversations?.length) {
            return
          }

          const result = await ensureConversationForCurrentSession()
          if (!result) {
            return
          }

          targetConversationId = result.conversationId
          useTreeStore.getState().setLockedSendConversationId(targetConversationId)
          await enterSessionContext(result.detail)
        }

        const targetConversation = conversationNodes.find((node) => node.conversationId === targetConversationId)
        const targetMessageCount = targetConversation?.messageCount ?? 0

        if (singleMessagePerNode && targetMessageCount >= 1) {
          const childResult = await ensureConversationForCurrentSession({ parentConversationId: targetConversationId })
          if (!childResult) {
            return
          }

          await enterSessionContext(childResult.detail)

          useTreeStore.getState().setLockedSendConversationId(childResult.conversationId)
          targetConversationId = childResult.conversationId
        }

        let writeConfirmed = false
        if (selectedAgentId === 'trae') {
          writeConfirmed = await confirmTraeRun()
          if (!writeConfirmed) {
            return
          }
        }

        await useChatWorkbenchStore.getState().sendMessageToConversation(targetConversationId, message, enableContext, {
          agentId: selectedAgentId,
          writeConfirmed,
        }, {
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
      onRequestError,
      onSendError,
      sendTargetConversationId,
      selectedAgentId,
      sessionDetail,
      settings,
      workspaceDetail,
      conversationDetail,
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
    setActiveSidebar(null)

    if (isSettingsRoute) {
      navigate('/chat')
    }
  }

  function openSidebar(mode: SidebarMode) {
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
          selectedConversationId={selectedConversationId}
          lockedSendConversationId={lockedSendConversationId}
          sessionDetail={sessionDetail}
          conversationDetail={conversationDetail}
          conversationNodes={conversationNodes}
          conversationMessages={conversationMessages}
          messagesLoading={messagesLoading}
          messagesError={messagesError}
          sending={isStreamingViewedConversation}
          selectedAgentId={selectedAgentId}
          canCreateConversationOnSend={canCreateConversationOnSend}
          initialLoading={initialLoading}
          onSendMessage={handleSendMessage}
          onAgentChange={setSelectedAgentId}
          onStopMessage={handleStopMessage}
          onCreateConversation={handleCreateConversation}
          onDeleteConversation={handleDeleteConversation}
          onCreateSession={handleCreateSession}
          onAutoArrange={handleAutoArrange}
          onNavPathTailChange={setNavPathTailId}
        />

        <div className={navClassName}>
          <Button
            type="text"
            shape="round"
            data-testid="exit-focus-button"
            className={`diagram-shell__exit-focus-overlay ${!isFocused ? 'diagram-shell__exit-focus-overlay--hidden' : ''}`}
            aria-label="退出聚焦"
            icon={
              <svg viewBox="0 0 1024 1024" width="16" height="16" fill="currentColor">
                <path d="M256 768v128H128V768h128m64-64H64v256h256V704zM576 768v128H448V768h128m64-64H384v256h256V704zM896 768v128H768V768h128m64-64H704v256h256V704zM607.7 127.9v191.5H416.3V127.9h191.4m64-64H352.3v319.5h96.4V448H126.1v64h1.9v128h63.3V512h257.4v128H576V512h256v128h63.3V512h0.7v-64H576v-64.6h95.7V63.9z" />
              </svg>
            }
            onClick={() => setFocusedConversationId(null)}
          />
          <div className="diagram-shell__nav-head">
            <div className="diagram-shell__nav-trigger-slot">
              <Button
                type="text"
                shape="round"
                className={`diagram-shell__nav-trigger ${isFocused ? 'diagram-shell__nav-trigger--focused' : ''}`}
                aria-label="打开侧边栏"
                onClick={() => setActiveSidebar('history')}
              >
                WB
              </Button>
            </div>

            {!isFocused && (
              <>
                <Drawer
                  open={activeSidebar !== null}
                  placement="left"
                  width={responsive.navWidth.open}
                  onClose={collapseNav}
                  title={
                    <Space>
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
                    </Space>
                  }
                  className="diagram-shell__drawer"
                >
                  <div className="diagram-shell__drawer-content">
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
                </Drawer>
              </>
            )}
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
                  label={focusedConversationId ? '聚焦态' : '概览态'}
                  tone={focusedConversationId ? 'warning' : 'default'}
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
