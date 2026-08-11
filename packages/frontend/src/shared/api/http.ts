import { getClientId } from '../logging/clientId'
import { ApiError } from './error'
import { AUTH_TOKEN_KEY, getApiUrl } from './config'
import type { ApiEnvelope, HttpRequestOptions } from './types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isApiEnvelope<TData>(value: unknown): value is ApiEnvelope<TData> {
  return isPlainObject(value) && ('data' in value || 'code' in value || 'message' in value)
}

function isResponseSuccess(code: number | undefined) {
  return code === undefined || code === 0 || code === 200
}

async function parseResponseBody(response: Response, parseAs: HttpRequestOptions['parseAs']) {
  if (parseAs === 'raw') {
    return response
  }

  if (parseAs === 'text') {
    return response.text()
  }

  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch (parseErr) {
    throw new ApiError('响应解析失败', { status: response.status, details: text })
  }
}

export async function request<TData = unknown, TBody = unknown>(
  url: string,
  options: HttpRequestOptions<TBody> = {},
): Promise<TData> {
  const { method = 'GET', headers, body, signal, parseAs = 'json' } = options

  const requestHeaders = new Headers(headers)
  requestHeaders.set('X-Client-Id', getClientId())
  const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  if (authToken) {
    requestHeaders.set('Authorization', `Bearer ${authToken}`)
  }
  let requestBody: BodyInit | undefined
  let capacitorData: unknown

  if (body !== undefined) {
    if (body instanceof FormData || body instanceof URLSearchParams || typeof body === 'string' || body instanceof Blob) {
      requestBody = body
      capacitorData = body
    } else {
      if (!requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json')
      }
      requestBody = JSON.stringify(body)
      // CapacitorHttp 要求 data 为可序列化对象，原生层负责序列化；
      // 传 stringify 后的 string 会导致请求异常，因此用原始对象
      capacitorData = body
    }
  } else if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    // CapacitorHttp native adds application/x-www-form-urlencoded to bodyless write requests.
    // Fastify rejects it with 415; send an empty JSON object instead.
    if (!requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json')
    }
    requestBody = '{}'
    capacitorData = {}
  }

  let response: Response
  const fullUrl = getApiUrl(url)

  let capacitorHttp: typeof import('@capacitor/core').CapacitorHttp | null = null
  try {
    const { CapacitorHttp } = await import('@capacitor/core')
    capacitorHttp = CapacitorHttp ?? null
  } catch {
    // @capacitor/core 不可用时，使用 fetch
  }

  if (capacitorHttp && !(body instanceof FormData)) {
    // FormData is not supported by the native CapacitorHttp layer on Android;
    // use the WebView fetch path so multipart uploads are serialized correctly.
    const nativeResponse = await capacitorHttp.request({
      url: fullUrl,
      method: method as any,
      headers: Object.fromEntries(requestHeaders.entries()),
      data: capacitorData,
    })
    // nativeResponse.data 可能已经是对象，不需要二次 stringify
    const bodyData = typeof nativeResponse.data === 'string' ? nativeResponse.data : JSON.stringify(nativeResponse.data)
    response = new Response(bodyData, {
      status: nativeResponse.status,
      headers: new Headers(nativeResponse.headers as Record<string, string>),
    })
  } else {
    response = await fetch(fullUrl, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal,
    })
  }

  const parsed = await parseResponseBody(response, parseAs)

  if (!response.ok) {
    const message = isApiEnvelope(parsed)
      ? parsed.message || `请求失败：${response.status}`
      : `请求失败：${response.status}`
    const code = isApiEnvelope(parsed) ? parsed.code : undefined
    throw new ApiError(message, { status: response.status, code, details: parsed })
  }

  if (parseAs === 'raw' || parseAs === 'text') {
    return parsed as TData
  }

  if (isApiEnvelope<TData>(parsed)) {
    if (!isResponseSuccess(parsed.code)) {
      throw new ApiError(parsed.message || '请求失败', {
        status: response.status,
        code: parsed.code,
        details: parsed,
      })
    }

    return (parsed.data ?? ({} as TData)) as TData
  }

  return parsed as TData
}

export function get<TData = unknown>(url: string, options: Omit<HttpRequestOptions, 'method' | 'body'> = {}) {
  return request<TData>(url, { ...options, method: 'GET' })
}

export function post<TData = unknown, TBody = unknown>(url: string, body?: TBody, options: Omit<HttpRequestOptions<TBody>, 'method' | 'body'> = {}) {
  return request<TData, TBody>(url, { ...options, method: 'POST', body })
}

export function put<TData = unknown, TBody = unknown>(url: string, body?: TBody, options: Omit<HttpRequestOptions<TBody>, 'method' | 'body'> = {}) {
  return request<TData, TBody>(url, { ...options, method: 'PUT', body })
}

export function patch<TData = unknown, TBody = unknown>(url: string, body?: TBody, options: Omit<HttpRequestOptions<TBody>, 'method' | 'body'> = {}) {
  return request<TData, TBody>(url, { ...options, method: 'PATCH', body })
}

export function del<TData = unknown>(url: string, options: Omit<HttpRequestOptions, 'method' | 'body'> = {}) {
  return request<TData>(url, { ...options, method: 'DELETE' })
}
