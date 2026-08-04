export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error'

export function toStatusTone(status: AsyncStatus) {
  if (status === 'loading') {
    return 'processing' as const
  }

  if (status === 'success') {
    return 'success' as const
  }

  if (status === 'error') {
    return 'error' as const
  }

  return 'default' as const
}

export function getStatusLabel(status: AsyncStatus, labels: Partial<Record<AsyncStatus, string>> = {}) {
  return labels[status] ?? status
}
