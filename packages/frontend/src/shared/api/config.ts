interface CapacitorGlobal {
  isNative?: boolean
  platform?: string
}

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
    const isNative = capacitor?.isNative || capacitor?.platform === 'android'
    const isCapacitorHost = window.location.origin === 'https://localhost'
    if (isNative || isCapacitorHost) {
      return 'http://127.0.0.1:3000'
    }
  }
  return ''
}

export const apiBaseUrl = getApiBaseUrl()

export function getApiUrl(path: string): string {
  const base = apiBaseUrl
  if (base) {
    return `${base}${path}`
  }
  return path
}

export async function waitForBackendReady(maxRetries = 60, intervalMs = 500): Promise<boolean> {
  if (!apiBaseUrl) {
    return true
  }
  
  const healthUrl = `${apiBaseUrl}/health`
  
  // Dynamically import CapacitorHttp if available
  let CapacitorHttp: { get: (options: { url: string; headers?: Record<string, string> }) => Promise<{ status: number }> } | null = null
  try {
    const { CapacitorHttp: http } = await import('@capacitor/core')
    CapacitorHttp = http
  } catch {
    // CapacitorHttp not available, use fetch
  }
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (CapacitorHttp) {
        const response = await CapacitorHttp.get({ 
          url: healthUrl,
          headers: { 'Accept': 'application/json' }
        })
        if (response.status >= 200 && response.status < 300) {
          console.log('[API] Backend service is ready')
          return true
        }
      } else {
        const response = await fetch(healthUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        })
        if (response.ok) {
          console.log('[API] Backend service is ready')
          return true
        }
      }
    } catch {
      // Service not ready yet, wait and retry
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  
  console.warn('[API] Backend service did not become ready in time')
  return false
}
