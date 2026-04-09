import { ApiError } from './error'
import type { SseEventMessage } from './types'

export type SseConnectionOptions = {
  withCredentials?: boolean
}

export type SseEventHandler<TData = unknown> = (event: SseEventMessage<TData>) => void

export type SseErrorHandler = (error: Event | ApiError | unknown) => void

export type SseHandlers<TData = unknown> = {
  onOpen?: () => void
  onEvent: SseEventHandler<TData>
  onError?: SseErrorHandler
}

function parsePayload<TData>(eventName: string, raw: string): SseEventMessage<TData> {
  if (!raw) {
    return { event: eventName, data: null, raw }
  }

  try {
    return {
      event: eventName,
      data: JSON.parse(raw) as TData,
      raw,
    }
  } catch {
    return {
      event: eventName,
      data: raw,
      raw,
    }
  }
}

export function connectSse<TData = unknown>(url: string, handlers: SseHandlers<TData>, options: SseConnectionOptions = {}) {
  const eventSource = new EventSource(url, { withCredentials: options.withCredentials })
  const eventNames = ['data', 'done', 'error', 'heartbeat'] as const

  eventSource.onopen = () => {
    handlers.onOpen?.()
  }

  eventSource.onmessage = (event) => {
    handlers.onEvent(parsePayload<TData>('message', event.data))
  }

  for (const eventName of eventNames) {
    eventSource.addEventListener(eventName, (event) => {
      const messageEvent = event as MessageEvent<string>
      handlers.onEvent(parsePayload<TData>(eventName, messageEvent.data))
    })
  }

  eventSource.onerror = (event) => {
    handlers.onError?.(new ApiError('SSE 连接异常', { details: event }))
  }

  return {
    close() {
      eventSource.close()
    },
    stop() {
      eventSource.close()
    },
    destroy() {
      eventSource.close()
    },
  }
}
