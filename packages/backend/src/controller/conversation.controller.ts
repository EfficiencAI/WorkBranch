import { FastifyRequest, FastifyReply } from 'fastify';
import { sessionService } from '../service/session-service';
import { messageQueue } from '../service/session-service/mq';
import { messageToDict, SegmentType } from '../service/session-service/canonical';
import { success } from './result';

const STREAM_MAX_TIMEOUT_TICKS = 300;

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
    const { message, enable_context } = request.body;

    const conversation = await sessionService.getConversationDetail(conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    let doneReceived = false;
    let timeoutCounter = 0;
    let messageId: string = '';
    let targetConversationId: string = '';

    const unsubscribe = messageQueue.subscribe(conversationId, (msg) => {
      const eventData = messageToDict(msg);
      eventData.message_id = messageId;

      reply.raw.write(`data: ${JSON.stringify(eventData)}\n\n`);

      const hasDoneSegment = msg.content_blocks.some((block) => block.type === SegmentType.DONE);
      if (hasDoneSegment) {
        doneReceived = true;
      }
    });

    let result;
    try {
      result = await sessionService.sendMessage(conversationId, message, enable_context);
    } catch (err) {
      const errorMessage = String(err);
      unsubscribe();
      if (errorMessage.includes('already running')) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: errorMessage })}\n\n`);
        reply.raw.end();
        return;
      }
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: errorMessage })}\n\n`);
      reply.raw.end();
      return;
    }

    messageId = result.message_id;
    targetConversationId = result.conversation_id;

    reply.raw.write(`data: ${JSON.stringify({
      type: 'message_created',
      message_id: messageId,
      conversation_id: targetConversationId,
      user_content: message,
    })}\n\n`);

    const checkInterval = setInterval(() => {
      if (doneReceived) {
        clearInterval(checkInterval);
        unsubscribe();
        reply.raw.end();
        return;
      }

      timeoutCounter++;
      if (timeoutCounter >= STREAM_MAX_TIMEOUT_TICKS) {
        clearInterval(checkInterval);
        unsubscribe();
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', message_id: messageId, content: 'Timeout' })}\n\n`);
        reply.raw.end();
      } else {
        reply.raw.write(': heartbeat\n\n');
      }
    }, 1000);
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
