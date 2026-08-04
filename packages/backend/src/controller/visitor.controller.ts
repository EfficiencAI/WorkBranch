import { FastifyReply, FastifyRequest } from 'fastify';
import { visitorService } from '../service/visitor-service';
import { success } from './result';

export class VisitorController {
  getMeta(request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) {
    const meta = visitorService.getShareMeta(request.params.token);
    if (!meta) {
      return reply.status(404).send({ code: 404, message: '分享不存在或已停用', data: null });
    }
    const { assistant, share } = meta;
    return reply.send(success({
      token: share.token,
      assistant: {
        id: assistant.id,
        name: assistant.name,
        avatar: assistant.avatar,
        description: assistant.description,
        welcome_message: assistant.welcome_message,
      },
    }));
  }

  createConversation(
    request: FastifyRequest<{ Params: { token: string }; Body: { visitor_label?: string } }>,
    reply: FastifyReply,
  ) {
    const meta = visitorService.getShareMeta(request.params.token);
    if (!meta) {
      return reply.status(404).send({ code: 404, message: '分享不存在或已停用', data: null });
    }
    const session = visitorService.createSession(meta.share.id, request.body?.visitor_label);
    return reply.status(201).send(success({
      session_id: session.id,
      assistant: meta.assistant.name,
    }));
  }
}
