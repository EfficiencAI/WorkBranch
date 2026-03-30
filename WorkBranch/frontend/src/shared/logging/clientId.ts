const CLIENT_ID_STORAGE_KEY = 'workbranch.client_id'

let memoryClientId: string | null = null

function generateClientId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function getClientId() {
  if (typeof window === 'undefined') {
    if (!memoryClientId) {
      memoryClientId = generateClientId()
    }
    return memoryClientId
  }

  try {
    const existing = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY)
    if (existing) {
      return existing
    }

    const nextId = generateClientId()
    window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, nextId)
    return nextId
  } catch {
    if (!memoryClientId) {
      memoryClientId = generateClientId()
    }
    return memoryClientId
  }
}
