import { Alert, App as AntdApp } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConversationDetail, MessageNode, SessionDetail, SessionSummary, UserProfile, WorkspaceDetail } from '../../entities'
import {
  fetchConversationDetail,
  fetchConversationNodes,
  fetchSessionDetail,
  fetchSessions,
  fetchWorkspaceDetail,
  getErrorMessage,
  streamSessionMessage,
} from '../../shared/api'
import { LoadingState } from '../../shared/ui'
import { WorkspaceShell } from '../../widgets'

export function WorkspacePage() {
  const { message } = AntdApp.useApp()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<string | number | null>(null)
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null)
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null)
  const [workspaceDetail, setWorkspaceDetail] = useState<WorkspaceDetail | null>(null)
  const [nodes, setNodes] = useState<MessageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mockUser = useMemo<UserProfile>(() => ({ id: 'user-demo', name: 'Misak' }), [])

  const loadConversationBundle = useCallback(async (conversationId: string) => {
    const detail = await fetchConversationDetail(conversationId)
    setConversationDetail(detail)

    const [nextNodes, nextWorkspace] = await Promise.all([
      fetchConversationNodes(conversationId),
      detail.workspaceId ? fetchWorkspaceDetail(detail.workspaceId) : Promise.resolve(null),
    ])

    setNodes(nextNodes)
    setWorkspaceDetail(nextWorkspace)
  }, [])

  const loadWorkspace = useCallback(async (preferredSessionId?: string | number | null) => {
    try {
      setLoading(true)
      setError(null)

      const nextSessions = await fetchSessions()
      setSessions(nextSessions)

      const nextSessionId = preferredSessionId ?? nextSessions[0]?.id ?? null
      setSelectedSessionId(nextSessionId)

      if (nextSessionId === null || nextSessionId === undefined) {
        setSessionDetail(null)
        setConversationDetail(null)
        setWorkspaceDetail(null)
        setNodes([])
        return
      }

      const detail = await fetchSessionDetail(nextSessionId)
      setSessionDetail(detail)

      if (!detail.activeConversationId) {
        setConversationDetail(null)
        setWorkspaceDetail(null)
        setNodes([])
        return
      }

      await loadConversationBundle(detail.activeConversationId)
    } catch (caughtError) {
      setError(getErrorMessage(caughtError, '工作台数据加载失败'))
    } finally {
      setLoading(false)
    }
  }, [loadConversationBundle])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const handleSelectSession = useCallback((sessionId: string | number) => {
    void loadWorkspace(sessionId)
  }, [loadWorkspace])

  const handleSendMessage = useCallback(async (messageText: string) => {
    if (!selectedSessionId || !conversationDetail) {
      return
    }

    try {
      setStreaming(true)
      await streamSessionMessage(
        selectedSessionId,
        {
          message: messageText,
          workspace_id: conversationDetail.workspaceId,
        },
        {
          onEvent(event) {
            if (event.type === 'error' && event.content) {
              void message.error(String(event.content))
            }
          },
        },
      )

      await loadWorkspace(selectedSessionId)
    } catch (caughtError) {
      message.error(getErrorMessage(caughtError, '消息发送失败'))
    } finally {
      setStreaming(false)
    }
  }, [conversationDetail, loadWorkspace, message, selectedSessionId])

  if (loading) {
    return <LoadingState tip="正在加载工作台数据..." />
  }

  if (error) {
    return <Alert type="error" showIcon message={error} />
  }

  return (
    <WorkspaceShell
      user={mockUser}
      sessions={sessions}
      selectedSessionId={selectedSessionId}
      sessionDetail={sessionDetail}
      conversationDetail={conversationDetail}
      workspaceDetail={workspaceDetail}
      nodes={nodes}
      sending={streaming}
      onSelectSession={handleSelectSession}
      onSendMessage={handleSendMessage}
    />
  )
}
