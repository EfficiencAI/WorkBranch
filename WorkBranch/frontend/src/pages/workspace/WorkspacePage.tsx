import { Alert, App as AntdApp } from 'antd'
import { useCallback, useEffect, useMemo } from 'react'
import type { UserProfile } from '../../entities'
import {
  selectChatWorkbenchError,
  selectChatWorkbenchLoading,
  useChatWorkbenchStore,
} from '../../features'
import { getErrorMessage } from '../../shared/api'
import { LoadingState } from '../../shared/ui'
import { WorkspaceShell } from '../../widgets'

export function WorkspacePage() {
  const { message } = AntdApp.useApp()
  const loading = useChatWorkbenchStore(selectChatWorkbenchLoading)
  const error = useChatWorkbenchStore(selectChatWorkbenchError)
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

  if (loading) {
    return <LoadingState tip="正在加载工作台数据..." />
  }

  if (error) {
    return <Alert type="error" showIcon message={error} />
  }

  return <WorkspaceShell user={mockUser} onSendError={handleSendError} onRequestError={handleRequestError} />
}
