import { Logger } from 'pino';
export declare const logger: Logger;
export declare function createLogger(name: string): Logger;
export interface LogContext {
    clientId?: string;
    conversationId?: string;
    workspaceId?: string;
    userId?: string;
    requestId?: string;
}
export declare function bindContext(ctx: LogContext): void;
export declare function getContext(requestId?: string): LogContext | undefined;
export declare function clearContext(requestId?: string): void;
//# sourceMappingURL=logger.d.ts.map