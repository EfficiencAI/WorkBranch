import { Alert, App as AntdApp } from 'antd'
import { useCallback, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  selectChatWorkbenchError,
  selectChatWorkbenchLoading,
  selectSessionError,
  selectSessionLoading,
  selectUserError,
  selectUserLoading,
  useChatWorkbenchStore,
  useSessionStore,
  useUserStore,
} from '../../features'
import { getErrorMessage } from '../../shared/api'
import { LoadingState } from '../../shared/ui'
import { DiagramShell } from '../../widgets'

export function DiagramPage() {
  const location = useLocation()
  const { message } = AntdApp.useApp()
  const chatLoading = useChatWorkbenchStore(selectChatWorkbenchLoading)
  const chatError = useChatWorkbenchStore(selectChatWorkbenchError)
  const sessionLoading = useSessionStore(selectSessionLoading)
  const sessionError = useSessionStore(selectSessionError)
  const userLoading = useUserStore(selectUserLoading)
  const userError = useUserStore(selectUserError)
  const loadChatWorkbench = useChatWorkbenchStore((state) => state.loadChatWorkbench)
  const loadProfile = useUserStore((state) => state.loadProfile)

  useEffect(() => {
    void Promise.all([loadChatWorkbench(), loadProfile()])
  }, [loadChatWorkbench, loadProfile])

  const handleSendError = useCallback((content: string) => {
    void message.error(content)
  }, [message])

  const handleRequestError = useCallback((caughtError: unknown) => {
    void message.error(getErrorMessage(caughtError, '消息发送失败'))
  }, [message])

  if (chatLoading || sessionLoading || userLoading) {
    return <LoadingState tip="正在加载图数据..." />
  }

  if (chatError || sessionError || userError) {
    return <Alert type="error" showIcon message={chatError ?? sessionError ?? userError ?? '图数据加载失败'} />
  }

  const isSettingsView = location.pathname === '/settings'

  return <DiagramShell onSendError={handleSendError} onRequestError={handleRequestError} view={isSettingsView ? 'settings' : 'chat'} />
}
