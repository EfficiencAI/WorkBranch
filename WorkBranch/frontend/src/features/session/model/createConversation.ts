import { createConversation } from '../../../shared/api'
import { useSessionStore } from './store'

export async function createConversationForCurrentSession(parentConversationId: string | null = null) {
  const { currentSessionId } = useSessionStore.getState()
  if (!currentSessionId) {
    return null
  }

  return await createConversation(currentSessionId, undefined, parentConversationId)
}
