export type ApiEnvelope<TData = unknown> = {
  code?: number
  message?: string
  data?: TData
}

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ResponseParseMode = 'json' | 'text' | 'raw'

export type HttpRequestOptions<TBody = unknown> = {
  method?: RequestMethod
  headers?: HeadersInit
  body?: TBody
  signal?: AbortSignal
  parseAs?: ResponseParseMode
}

export type SseEventName = 'data' | 'done' | 'error' | 'heartbeat' | 'message'

export type SseEventMessage<TData = unknown> = {
  event: SseEventName | string
  data: TData | string | null
  raw: string
}
