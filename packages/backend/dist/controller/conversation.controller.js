"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationController = void 0;
const session_service_1 = require("../service/session-service");
const result_1 = require("./result");
class ConversationController {
    async getConversation(request, reply) {
        const { conversationId } = request.params;
        const conversation = await session_service_1.sessionService.getConversationDetail(conversationId);
        if (!conversation) {
            return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
        }
        return reply.send((0, result_1.success)(conversation));
    }
    async getConversationMessages(request, reply) {
        const { conversationId } = request.params;
        const conversation = await session_service_1.sessionService.getConversationDetail(conversationId);
        if (!conversation) {
            return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
        }
        const messages = await session_service_1.sessionService.getConversationMessages(conversationId);
        return reply.send((0, result_1.success)(messages));
    }
    async getConversationContextInfo(request, reply) {
        const { conversationId } = request.params;
        const conversation = await session_service_1.sessionService.getConversationDetail(conversationId);
        if (!conversation) {
            return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
        }
        const contextInfo = await session_service_1.sessionService.getContextInfo(conversationId);
        return reply.send((0, result_1.success)(contextInfo));
    }
    async sendMessage(request, reply) {
        const { conversationId } = request.params;
        const { message } = request.body;
        const conversation = await session_service_1.sessionService.getConversationDetail(conversationId);
        if (!conversation) {
            return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
        }
        try {
            const result = await session_service_1.sessionService.sendMessage(conversationId, message);
            return reply.status(201).send((0, result_1.success)(result));
        }
        catch (err) {
            const errorMessage = String(err);
            if (errorMessage.includes('already running')) {
                return reply.status(400).send({ code: 400, message: errorMessage, data: null });
            }
            return reply.status(404).send({ code: 404, message: errorMessage, data: null });
        }
    }
    async endConversation(request, reply) {
        const { conversationId } = request.params;
        const conversation = await session_service_1.sessionService.getConversationDetail(conversationId);
        if (!conversation) {
            return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
        }
        const flushedCount = await session_service_1.sessionService.endConversation(conversationId);
        return reply.send((0, result_1.success)({ flushed_count: flushedCount }));
    }
    async cancelConversation(request, reply) {
        const { conversationId } = request.params;
        const conversation = await session_service_1.sessionService.getConversationDetail(conversationId);
        if (!conversation) {
            return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
        }
        const result = await session_service_1.sessionService.cancelConversation(conversationId);
        return reply.send((0, result_1.success)({ cancelled: result }));
    }
    async deleteConversation(request, reply) {
        const { conversationId } = request.params;
        const conversation = await session_service_1.sessionService.getConversationDetail(conversationId);
        if (!conversation) {
            return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
        }
        const deleted = await session_service_1.sessionService.deleteConversation(conversationId);
        return reply.send((0, result_1.success)({ deleted, conversation_id: conversationId }));
    }
    async cascadeDeleteConversation(request, reply) {
        const { conversationId } = request.params;
        const conversation = await session_service_1.sessionService.getConversationDetail(conversationId);
        if (!conversation) {
            return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
        }
        const deleted = await session_service_1.sessionService.cascadeDeleteConversation(conversationId);
        return reply.send((0, result_1.success)({ deleted, conversation_id: conversationId }));
    }
}
exports.ConversationController = ConversationController;
//# sourceMappingURL=conversation.controller.js.map