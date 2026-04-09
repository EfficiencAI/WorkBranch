"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionController = void 0;
const session_service_1 = require("../service/session-service");
const result_1 = require("./result");
class SessionController {
    async createSession(request, reply) {
        const title = request.body?.title || '新会话';
        const session = session_service_1.sessionService.createSession(title);
        return reply.status(201).send((0, result_1.success)({
            id: session.id,
            title: session.title,
            created_at: session.created_at,
            updated_at: session.updated_at,
        }));
    }
    async listSessions(_request, reply) {
        const sessions = session_service_1.sessionService.listSessions();
        return reply.send((0, result_1.success)(sessions.map((s) => ({
            id: s.id,
            title: s.title,
            created_at: s.created_at,
            updated_at: s.updated_at,
        }))));
    }
    async getSession(request, reply) {
        const { sessionId } = request.params;
        const session = session_service_1.sessionService.getSession(Number(sessionId));
        if (!session) {
            return reply.status(404).send({ code: 404, message: 'Session not found', data: null });
        }
        return reply.send((0, result_1.success)({
            id: session.id,
            user_id: session.user_id,
            title: session.title,
            created_at: session.created_at,
            updated_at: session.updated_at,
        }));
    }
    async listSessionConversations(request, reply) {
        const { sessionId } = request.params;
        const session = session_service_1.sessionService.getSession(Number(sessionId));
        if (!session) {
            return reply.status(404).send({ code: 404, message: 'Session not found', data: null });
        }
        const conversations = await session_service_1.sessionService.listConversationSummaries(Number(sessionId));
        return reply.send((0, result_1.success)(conversations));
    }
    async updateConversationPositions(request, reply) {
        const { sessionId } = request.params;
        const { positions } = request.body;
        const session = session_service_1.sessionService.getSession(Number(sessionId));
        if (!session) {
            return reply.status(404).send({ code: 404, message: 'Session not found', data: null });
        }
        try {
            await session_service_1.sessionService.updateConversationPositions(Number(sessionId), positions);
            return reply.send((0, result_1.success)({ updated: positions.length }));
        }
        catch (err) {
            return reply.status(400).send({ code: 400, message: String(err), data: null });
        }
    }
    async deleteSession(request, reply) {
        const { sessionId } = request.params;
        session_service_1.sessionService.deleteSession(Number(sessionId));
        return reply.send((0, result_1.success)(null));
    }
    async createConversation(request, reply) {
        const { sessionId } = request.params;
        const { workspace_id, parent_conversation_id } = request.body || {};
        const session = session_service_1.sessionService.getSession(Number(sessionId));
        if (!session) {
            return reply.status(404).send({ code: 404, message: 'Session not found', data: null });
        }
        try {
            const result = await session_service_1.sessionService.createConversation(Number(sessionId), workspace_id, parent_conversation_id);
            return reply.status(201).send((0, result_1.success)(result));
        }
        catch (err) {
            return reply.status(400).send({ code: 400, message: String(err), data: null });
        }
    }
}
exports.SessionController = SessionController;
//# sourceMappingURL=session.controller.js.map