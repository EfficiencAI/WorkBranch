interface CapacitorGlobal {
  isNative?: boolean
  platform?: string
}

let _cachedBaseUrl: string | null = null

function getApiBaseUrl(): string {
  if (_cachedBaseUrl !== null) {
    return _cachedBaseUrl
  }

  if (typeof window !== 'undefined') {
    const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
    const isNative = capacitor?.isNative === true || capacitor?.platform === 'android'
    const isCapacitorHost = window.location.origin === 'http://localhost' || window.location.origin === 'https://localhost'
    if (isNative || isCapacitorHost) {
      _cachedBaseUrl = 'http://127.0.0.1:3000'
      return _cachedBaseUrl
    }
  }
  _cachedBaseUrl = ''
  return _cachedBaseUrl
}

export function getApiBaseUrlRuntime(): string {
  return getApiBaseUrl()
}

// 保持向后兼容，导出getApiBaseUrl
export { getApiBaseUrl }

export function getApiUrl(path: string): string {
  const base = getApiBaseUrl()
  if (base) {
    return `${base}${path}`
  }
  return path
}

export const AUTH_TOKEN_KEY = 'workassistant_token'
/** 本地离线用户使用的固定 token：loadSession 识别后直接放行，不请求后端 */
export const LOCAL_OFFLINE_TOKEN = 'local-offline'

export async function waitForBackendReady(maxRetries = 60, intervalMs = 500): Promise<boolean> {
  const currentBaseUrl = getApiBaseUrl()
  if (!currentBaseUrl) {
    return true
  }
  
  const healthUrl = `${currentBaseUrl}/health`
  
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
    } catch (healthErr) {
      // Service not ready yet, wait and retry
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  
  console.warn('[API] Backend service did not become ready in time')
  return false
}
