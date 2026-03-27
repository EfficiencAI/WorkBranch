import { createConversation } from '../../../shared/api'
import { setActiveConversationForSession } from './currentConversation'
import { useSessionStore } from './store'

export async function createConversationForCurrentSession() {
  const { currentSessionId } = useSessionStore.getState()
  if (!currentSessionId) {
    return null
  }

  const created = await createConversation(currentSessionId)
  await setActiveConversationForSession(currentSessionId, created.conversationId)
  return created
}
