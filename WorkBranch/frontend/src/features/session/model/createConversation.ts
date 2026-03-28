import { createConversation } from '../../../shared/api'
import { useSessionStore } from './store'

export async function createConversationForCurrentSession() {
  const { currentSessionId } = useSessionStore.getState()
  if (!currentSessionId) {
    return null
  }

  return await createConversation(currentSessionId)
}
