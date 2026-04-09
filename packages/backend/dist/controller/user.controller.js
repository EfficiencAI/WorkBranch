"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const service_1 = require("../service");
const result_1 = require("./result");
class UserController {
    async getUserProfile(_request, reply) {
        const user = service_1.userService.getCurrentUser();
        return reply.send((0, result_1.success)({
            id: user.id,
            name: user.name,
        }));
    }
    async updateUserName(request, reply) {
        const { name } = request.body;
        const user = service_1.userService.updateUserName(name);
        return reply.send((0, result_1.success)({
            id: user.id,
            name: user.name,
        }));
    }
    async listSessions(_request, reply) {
        const sessions = service_1.sessionService.listSessions();
        return reply.send((0, result_1.success)(sessions.map((s) => ({
            id: s.id,
            title: s.title,
            created_at: s.created_at,
            updated_at: s.updated_at,
        }))));
    }
    async getSession(request, reply) {
        const { sessionId } = request.params;
        const session = service_1.sessionService.getSession(Number(sessionId));
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
    async createSession(request, reply) {
        const { title } = request.body;
        const session = service_1.sessionService.createSession(title);
        return reply.status(201).send((0, result_1.success)({
            id: session.id,
            title: session.title,
            created_at: session.created_at,
            updated_at: session.updated_at,
        }));
    }
    async deleteSession(request, reply) {
        const { sessionId } = request.params;
        service_1.sessionService.deleteSession(Number(sessionId));
        return reply.send((0, result_1.success)(null));
    }
}
exports.UserController = UserController;
//# sourceMappingURL=user.controller.js.map