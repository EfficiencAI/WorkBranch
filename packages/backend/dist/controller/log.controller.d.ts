import { FastifyRequest, FastifyReply } from 'fastify';
interface LogRequestBody {
    level: 'INFO' | 'WARNING' | 'ERROR';
    event: string;
    msg?: string;
    extra?: Record<string, unknown>;
    client_ts: string;
}
export declare class LogController {
    log(request: FastifyRequest<{
        Body: LogRequestBody;
    }>, reply: FastifyReply): Promise<never>;
}
export {};
//# sourceMappingURL=log.controller.d.ts.map