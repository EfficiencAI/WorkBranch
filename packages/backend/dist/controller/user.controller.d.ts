import { FastifyRequest, FastifyReply } from 'fastify';
export declare class UserController {
    getUserProfile(_request: FastifyRequest, reply: FastifyReply): Promise<never>;
    updateUserName(request: FastifyRequest<{
        Body: {
            name: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    listSessions(_request: FastifyRequest, reply: FastifyReply): Promise<never>;
    getSession(request: FastifyRequest<{
        Params: {
            sessionId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    createSession(request: FastifyRequest<{
        Body: {
            title: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    deleteSession(request: FastifyRequest<{
        Params: {
            sessionId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=user.controller.d.ts.map