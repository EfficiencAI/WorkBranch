import { FastifyRequest, FastifyReply } from 'fastify';
import { sessionService } from '../service/session-service';
import { success } from './result';

export class ConversationController {
  async getConversation(
    request: FastifyRequest<{ Params: { conversationId: string } }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const conversation = await sessionService.getConversationDetail(conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }
    return reply.send(success(conversation));
  }

  async getConversationMessages(
    request: FastifyRequest<{ Params: { conversationId: string } }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const conversation = await sessionService.getConversationDetail(conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }
    const messages = await sessionService.getConversationMessages(conversationId);
    return reply.send(success(messages));
  }

  async getConversationContextInfo(
    request: FastifyRequest<{ Params: { conversationId: string } }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const conversation = await sessionService.getConversationDetail(conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }
    const contextInfo = await sessionService.getContextInfo(conversationId);
    return reply.send(success(contextInfo));
  }

  async sendMessage(
    request: FastifyRequest<{
      Params: { conversationId: string };
      Body: { message: string; enable_context?: boolean };
    }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const { message } = request.body;

    const conversation = await sessionService.getConversationDetail(conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }

    try {
      const result = await sessionService.sendMessage(conversationId, message);
      return reply.status(201).send(success(result));
    } catch (err) {
      const errorMessage = String(err);
      if (errorMessage.includes('already running')) {
        return reply.status(400).send({ code: 400, message: errorMessage, data: null });
      }
      return reply.status(404).send({ code: 404, message: errorMessage, data: null });
    }
  }

  async endConversation(
    request: FastifyRequest<{ Params: { conversationId: string } }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const conversation = await sessionService.getConversationDetail(conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }
    const flushedCount = await sessionService.endConversation(conversationId);
    return reply.send(success({ flushed_count: flushedCount }));
  }

  async cancelConversation(
    request: FastifyRequest<{ Params: { conversationId: string } }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const conversation = await sessionService.getConversationDetail(conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }
    const result = await sessionService.cancelConversation(conversationId);
    return reply.send(success({ cancelled: result }));
  }

  async deleteConversation(
    request: FastifyRequest<{ Params: { conversationId: string } }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const conversation = await sessionService.getConversationDetail(conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }
    const deleted = await sessionService.deleteConversation(conversationId);
    return reply.send(success({ deleted, conversation_id: conversationId }));
  }

  async cascadeDeleteConversation(
    request: FastifyRequest<{ Params: { conversationId: string } }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const conversation = await sessionService.getConversationDetail(conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }
    const deleted = await sessionService.cascadeDeleteConversation(conversationId);
    return reply.send(success({ deleted, conversation_id: conversationId }));
  }
}
