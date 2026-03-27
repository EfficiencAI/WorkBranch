import { Alert, App as AntdApp } from 'antd'
import { useCallback, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import type { UserProfile } from '../../entities'
import {
  selectChatWorkbenchError,
  selectChatWorkbenchLoading,
  selectSessionError,
  selectSessionLoading,
  useChatWorkbenchStore,
  useSessionStore,
} from '../../features'
import { getErrorMessage } from '../../shared/api'
import { LoadingState } from '../../shared/ui'
import { WorkspaceShell } from '../../widgets'

export function WorkspacePage() {
  const location = useLocation()
  const { message } = AntdApp.useApp()
  const chatLoading = useChatWorkbenchStore(selectChatWorkbenchLoading)
  const chatError = useChatWorkbenchStore(selectChatWorkbenchError)
  const sessionLoading = useSessionStore(selectSessionLoading)
  const sessionError = useSessionStore(selectSessionError)
  const loadChatWorkbench = useChatWorkbenchStore((state) => state.loadChatWorkbench)
  const mockUser = useMemo<UserProfile>(() => ({ id: 'user-demo', name: 'Misak' }), [])

  useEffect(() => {
    void loadChatWorkbench()
  }, [loadChatWorkbench])

  const handleSendError = useCallback((content: string) => {
    void message.error(content)
  }, [message])

  const handleRequestError = useCallback((caughtError: unknown) => {
    void message.error(getErrorMessage(caughtError, '消息发送失败'))
  }, [message])

  if (chatLoading || sessionLoading) {
    return <LoadingState tip="正在加载工作台数据..." />
  }

  if (chatError || sessionError) {
    return <Alert type="error" showIcon message={chatError ?? sessionError ?? '工作台数据加载失败'} />
  }

  const isSettingsView = location.pathname === '/settings'

  return <WorkspaceShell user={mockUser} onSendError={handleSendError} onRequestError={handleRequestError} view={isSettingsView ? 'settings' : 'chat'} />
}
