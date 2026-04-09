import { FastifyRequest, FastifyReply } from 'fastify';
export declare class SettingsController {
    getAllSettings(_request: FastifyRequest, reply: FastifyReply): Promise<never>;
    getSetting(request: FastifyRequest<{
        Params: {
            key: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    updateSetting(request: FastifyRequest<{
        Params: {
            key: string;
        };
        Body: {
            value: unknown;
        };
    }>, reply: FastifyReply): Promise<never>;
    updateSettings(request: FastifyRequest<{
        Body: Record<string, unknown>;
    }>, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=settings.controller.d.ts.map