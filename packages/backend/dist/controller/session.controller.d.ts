import { FastifyRequest, FastifyReply } from 'fastify';
export declare class SessionController {
    createSession(request: FastifyRequest<{
        Body: {
            title?: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    listSessions(_request: FastifyRequest, reply: FastifyReply): Promise<never>;
    getSession(request: FastifyRequest<{
        Params: {
            sessionId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    listSessionConversations(request: FastifyRequest<{
        Params: {
            sessionId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    updateConversationPositions(request: FastifyRequest<{
        Params: {
            sessionId: string;
        };
        Body: {
            positions: Array<{
                conversation_id: string;
                x: number;
                y: number;
            }>;
        };
    }>, reply: FastifyReply): Promise<never>;
    deleteSession(request: FastifyRequest<{
        Params: {
            sessionId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    createConversation(request: FastifyRequest<{
        Params: {
            sessionId: string;
        };
        Body: {
            workspace_id?: string;
            parent_conversation_id?: string;
        };
    }>, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=session.controller.d.ts.map