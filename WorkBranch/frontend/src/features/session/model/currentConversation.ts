import type { SessionId } from '../../../entities'
import { patchSessionActiveConversation } from '../../../shared/api'
import { useChatWorkbenchStore } from '../../chat-workbench'
import { useSessionStore } from './store'

export async function setActiveConversationForSession(sessionId: SessionId, conversationId: string | null) {
  const detail = await patchSessionActiveConversation(sessionId, conversationId)
  useSessionStore.getState().setSessionDetail(detail)

  if (detail.activeConversationId) {
    await useChatWorkbenchStore.getState().loadConversationBundle(detail.activeConversationId)
  } else {
    useChatWorkbenchStore.getState().resetConversationState()
  }

  return detail
}
