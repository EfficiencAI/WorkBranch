import { FastifyRequest, FastifyReply } from 'fastify';
export declare class ConversationController {
    getConversation(request: FastifyRequest<{
        Params: {
            conversationId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    getConversationMessages(request: FastifyRequest<{
        Params: {
            conversationId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    getConversationContextInfo(request: FastifyRequest<{
        Params: {
            conversationId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    sendMessage(request: FastifyRequest<{
        Params: {
            conversationId: string;
        };
        Body: {
            message: string;
            enable_context?: boolean;
        };
    }>, reply: FastifyReply): Promise<never>;
    endConversation(request: FastifyRequest<{
        Params: {
            conversationId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    cancelConversation(request: FastifyRequest<{
        Params: {
            conversationId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    deleteConversation(request: FastifyRequest<{
        Params: {
            conversationId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
    cascadeDeleteConversation(request: FastifyRequest<{
        Params: {
            conversationId: string;
        };
    }>, reply: FastifyReply): Promise<never>;
}
//# sourceMappingURL=conversation.controller.d.ts.map