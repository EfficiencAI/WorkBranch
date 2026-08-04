import { FastifyRequest, FastifyReply } from 'fastify';
import { userService, sessionService } from '../service';
import { success } from './result';

export class UserController {
  async getUserProfile(_request: FastifyRequest, reply: FastifyReply) {
    const user = userService.getCurrentUser();
    return reply.send(success({
      id: user.id,
      name: user.name,
    }));
  }

  async updateUserName(request: FastifyRequest<{ Body: { name: string } }>, reply: FastifyReply) {
    const { name } = request.body;
    const user = userService.updateUserName(name);
    return reply.send(success({
      id: user.id,
      name: user.name,
    }));
  }

  async listSessions(_request: FastifyRequest, reply: FastifyReply) {
    const sessions = sessionService.listSessions();
    return reply.send(success(sessions.map((s) => ({
      id: s.id,
      title: s.title,
      created_at: s.created_at,
      updated_at: s.updated_at,
    }))));
  }

  async getSession(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
    const { sessionId } = request.params;
    const session = sessionService.getSession(Number(sessionId));
    if (!session) {
      return reply.status(404).send({ code: 404, message: 'Session not found', data: null });
    }
    return reply.send(success({
      id: session.id,
      user_id: session.user_id,
      title: session.title,
      created_at: session.created_at,
      updated_at: session.updated_at,
    }));
  }

  async createSession(request: FastifyRequest<{ Body: { title: string } }>, reply: FastifyReply) {
    const { title } = request.body;
    const session = sessionService.createSession(title);
    return reply.status(201).send(success({
      id: session.id,
      title: session.title,
      created_at: session.created_at,
      updated_at: session.updated_at,
    }));
  }

  async deleteSession(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
    const { sessionId } = request.params;
    sessionService.deleteSession(Number(sessionId));
    return reply.send(success(null));
  }
}
