import { FastifyRequest, FastifyReply } from 'fastify';
import { sessionService } from '../service/session-service';
import { messageQueue } from '../service/session-service/mq';
import { messageToDict, SegmentType } from '../service/session-service/canonical';
import { success } from './result';
import { logger } from '../core/logging';

const STREAM_MAX_TIMEOUT_TICKS = 300;

export class ConversationController {
  async getConversation(
    request: FastifyRequest<{ Params: { conversationId: string } }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const conversation = sessionService.getOwnedConversation(request.userId!, conversationId);
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
    const conversation = sessionService.getOwnedConversation(request.userId!, conversationId);
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
    const conversation = sessionService.getOwnedConversation(request.userId!, conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }
    const contextInfo = await sessionService.getContextInfo(conversationId);
    return reply.send(success(contextInfo));
  }

  async sendMessage(
    request: FastifyRequest<{
      Params: { conversationId: string };
      Body: { message: string; enable_context?: boolean; agent_id?: 'builtin' | 'trae'; write_confirmed?: boolean; last_seq?: number; web_enabled?: boolean };
    }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const { message, enable_context, agent_id, write_confirmed, last_seq, web_enabled } = request.body;

    const conversation = sessionService.getOwnedConversation(request.userId!, conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const streamState = messageQueue.getStreamState(conversationId);
    const lastSeq = last_seq ?? 0;

    if (streamState.is_completed && lastSeq > 0) {
      const missedMessages = messageQueue.getMessagesAfter(conversationId, lastSeq);
      if (missedMessages.length > 0) {
        for (const { message: msg, seq } of missedMessages) {
          const eventData = messageToDict(msg);
          eventData.seq = seq;
          reply.raw.write(`data: ${JSON.stringify(eventData)}\n\n`);
        }
      }
      reply.raw.write(`data: ${JSON.stringify({ type: 'done', last_seq: streamState.last_seq })}\n\n`);
      reply.raw.end();
      return;
    }

    let doneReceived = false;
    let timeoutCounter = 0;
    let messageId: string = '';
    let targetConversationId: string = '';

    const unsubscribe = messageQueue.subscribe(conversationId, (msg, seq) => {
      const eventData = messageToDict(msg);
      eventData.message_id = messageId;
      eventData.seq = seq;

      reply.raw.write(`data: ${JSON.stringify(eventData)}\n\n`);

      const hasDoneSegment = msg.content_blocks.some((block) => block.type === SegmentType.DONE);
      const hasErrorSegment = msg.content_blocks.some((block) => block.type === SegmentType.ERROR);
      if (hasDoneSegment || hasErrorSegment) {
        doneReceived = true;
      }
    }, { lastSeq });

    let result;
    try {
      result = await sessionService.sendMessage(conversationId, message, enable_context, agent_id, write_confirmed === true, web_enabled === true);
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

    // SSE 连接断开时联动取消对话，防止僵尸 running 状态
    const onConnectionClosed = async () => {
      logger.info({ conversationId }, 'SSE connection closed, initiating cancel');
      clearInterval(checkInterval);
      unsubscribe();
      try {
        await sessionService.cancelConversation(conversationId);
      } catch (cancelErr) {
        logger.error({ err: cancelErr, conversationId }, 'Cancel on disconnect failed');
      }
    };
    request.raw.on('close', onConnectionClosed);

    let cleanedUp = false;
    let resolveStreamFinished: (() => void) | null = null;
    const cleanup = () => {
      if (!cleanedUp) {
        cleanedUp = true;
        clearInterval(checkInterval);
        unsubscribe();
        request.raw.removeListener('close', onConnectionClosed);
        resolveStreamFinished?.();
      }
    };

    const checkInterval = setInterval(() => {
      if (doneReceived) {
        cleanup();
        reply.raw.end();
        return;
      }

      timeoutCounter++;
      if (timeoutCounter >= STREAM_MAX_TIMEOUT_TICKS) {
        cleanup();
        sessionService.cancelConversation(conversationId).catch((cancelErr) => {
          console.error('[ConversationController] Cancel on timeout failed:', cancelErr);
        });
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', message_id: messageId, content: 'Timeout' })}\n\n`);
        reply.raw.end();
      } else {
        reply.raw.write(': heartbeat\n\n');
      }
    }, 1000);

    return new Promise<void>((resolve) => {
      resolveStreamFinished = resolve;
    });
  }

  async endConversation(
    request: FastifyRequest<{ Params: { conversationId: string } }>,
    reply: FastifyReply
  ) {
    const { conversationId } = request.params;
    const conversation = sessionService.getOwnedConversation(request.userId!, conversationId);
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
    const conversation = sessionService.getOwnedConversation(request.userId!, conversationId);
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
    const conversation = sessionService.getOwnedConversation(request.userId!, conversationId);
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
    const conversation = sessionService.getOwnedConversation(request.userId!, conversationId);
    if (!conversation) {
      return reply.status(404).send({ code: 404, message: 'Conversation not found', data: null });
    }
    const deleted = await sessionService.cascadeDeleteConversation(conversationId);
    return reply.send(success({ deleted, conversation_id: conversationId }));
  }
}
