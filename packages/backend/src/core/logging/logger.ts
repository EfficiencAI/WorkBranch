import pino, { Logger } from 'pino';

const isDev = process.env.NODE_ENV !== 'production';
const cwd = process.cwd();
const isAndroid = cwd === '/' || cwd === '/system';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev && !isAndroid
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export function createLogger(name: string): Logger {
  return logger.child({ name });
}

export interface LogContext {
  clientId?: string;
  conversationId?: string;
  workspaceId?: string;
  userId?: string;
  requestId?: string;
}

const contextStorage = new Map<string, LogContext>();

export function bindContext(ctx: LogContext): void {
  const requestId = ctx.requestId || 'default';
  contextStorage.set(requestId, { ...contextStorage.get(requestId), ...ctx });
}

export function getContext(requestId?: string): LogContext | undefined {
  return contextStorage.get(requestId || 'default');
}

export function clearContext(requestId?: string): void {
  if (requestId) {
    contextStorage.delete(requestId);
  } else {
    contextStorage.clear();
  }
}
