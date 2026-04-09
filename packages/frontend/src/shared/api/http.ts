import { getClientId } from '../logging/clientId'
import { ApiError } from './error'
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
  } catch {
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
  let requestBody: BodyInit | undefined

  if (body !== undefined) {
    if (body instanceof FormData || body instanceof URLSearchParams || typeof body === 'string' || body instanceof Blob) {
      requestBody = body
    } else {
      if (!requestHeaders.has('Content-Type')) {
        requestHeaders.set('Content-Type', 'application/json')
      }
      requestBody = JSON.stringify(body)
    }
  }

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal,
    })
  } catch (error) {
    throw new ApiError('网络请求失败', { details: error })
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
