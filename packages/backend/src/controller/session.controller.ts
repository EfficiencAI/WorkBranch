import { FastifyRequest, FastifyReply } from 'fastify';
import { sessionService } from '../service/session-service';
import { success } from './result';

export class SessionController {
  async createSession(
    request: FastifyRequest<{ Querystring: { title?: string }; Body: { title?: string } }>,
    reply: FastifyReply
  ) {
    const title = request.query.title || request.body?.title || '新会话';
    const session = sessionService.createSession(request.userId!, title);
    return reply.status(201).send(success({
      id: session.id,
      title: session.title,
      created_at: session.created_at,
      updated_at: session.updated_at,
    }));
  }

  async listSessions(request: FastifyRequest, reply: FastifyReply) {
    const sessions = sessionService.listSessions(request.userId!);
    return reply.send(success(sessions.map((s) => ({
      id: s.id,
      title: s.title,
      created_at: s.created_at,
      updated_at: s.updated_at,
    }))));
  }

  async getSession(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
    const { sessionId } = request.params;
    const session = sessionService.getSession(request.userId!, Number(sessionId));
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

  async listSessionConversations(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
    const { sessionId } = request.params;
    const session = sessionService.getSession(request.userId!, Number(sessionId));
    if (!session) {
      return reply.status(404).send({ code: 404, message: 'Session not found', data: null });
    }
    const conversations = await sessionService.listConversationSummaries(request.userId!, Number(sessionId));
    return reply.send(success(conversations));
  }

  async updateConversationPositions(
    request: FastifyRequest<{
      Params: { sessionId: string };
      Body: { positions: Array<{ conversation_id: string; x: number; y: number }> };
    }>,
    reply: FastifyReply
  ) {
    const { sessionId } = request.params;
    const { positions } = request.body;
    const session = sessionService.getSession(request.userId!, Number(sessionId));
    if (!session) {
      return reply.status(404).send({ code: 404, message: 'Session not found', data: null });
    }

    try {
      await sessionService.updateConversationPositions(request.userId!, Number(sessionId), positions);
      return reply.send(success({ updated: positions.length }));
    } catch (err) {
      return reply.status(400).send({ code: 400, message: String(err), data: null });
    }
  }

  async deleteSession(request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) {
    const { sessionId } = request.params;
    sessionService.deleteSession(request.userId!, Number(sessionId));
    return reply.send(success(null));
  }

  async createConversation(
    request: FastifyRequest<{
      Params: { sessionId: string };
      Body: { parent_conversation_id?: string };
    }>,
    reply: FastifyReply
  ) {
    const { sessionId } = request.params;
    const { parent_conversation_id } = request.body || {};
    const session = sessionService.getSession(request.userId!, Number(sessionId));
    if (!session) {
      return reply.status(404).send({ code: 404, message: 'Session not found', data: null });
    }

    try {
      const result = await sessionService.createConversation(
        request.userId!,
        Number(sessionId),
        parent_conversation_id
      );
      return reply.status(201).send(success(result));
    } catch (err) {
      return reply.status(400).send({ code: 400, message: String(err), data: null });
    }
  }
}
