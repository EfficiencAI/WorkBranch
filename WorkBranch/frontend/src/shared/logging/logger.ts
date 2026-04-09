import { getClientId } from './clientId'

type FrontendLogLevel = 'INFO' | 'WARNING' | 'ERROR'
type FrontendLogEvent =
  | 'create_conversation'
  | 'delete_conversation'
  | 'switch_conversation'
  | 'send_message'
  | 'stream_completed'
  | 'stream_failed'
  | 'client.restored'
  | 'workspace.loaded'
  | 'auto_arrange_conversations'
  | 'move_conversation_node'
  | 'cancel_conversation_failed'
  | 'cancel_state_reload_failed'

type FrontendLogPayload = {
  msg?: string
  extra?: Record<string, unknown>
}

const ALLOWED_EVENTS = new Set<FrontendLogEvent>([
  'create_conversation',
  'delete_conversation',
  'switch_conversation',
  'send_message',
  'stream_completed',
  'stream_failed',
  'client.restored',
  'workspace.loaded',
  'auto_arrange_conversations',
  'move_conversation_node',
  'cancel_conversation_failed',
  'cancel_state_reload_failed',
])

let warnedOnce = false

function shouldWarn() {
  return typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
}

async function emit(level: FrontendLogLevel, event: FrontendLogEvent, payload: FrontendLogPayload = {}) {
  if (!ALLOWED_EVENTS.has(event)) {
    return
  }

  try {
    const response = await fetch('/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': getClientId(),
      },
      body: JSON.stringify({
        level,
        event,
        msg: payload.msg,
        extra: payload.extra,
        client_ts: new Date().toISOString(),
      }),
    })

    if (!response.ok && shouldWarn() && !warnedOnce) {
      warnedOnce = true
      console.warn(`[frontend-logger] failed to send log (status: ${response.status})`)
    }
  } catch {
    if (shouldWarn() && !warnedOnce) {
      warnedOnce = true
      console.warn('[frontend-logger] failed to send log')
    }
  }
}

export const frontendLogger = {
  info(event: FrontendLogEvent, payload?: FrontendLogPayload) {
    void emit('INFO', event, payload)
  },
  warning(event: FrontendLogEvent, payload?: FrontendLogPayload) {
    void emit('WARNING', event, payload)
  },
  error(event: FrontendLogEvent, payload?: FrontendLogPayload) {
    void emit('ERROR', event, payload)
  },
}

export type { FrontendLogEvent, FrontendLogLevel, FrontendLogPayload }
