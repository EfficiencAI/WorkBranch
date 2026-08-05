import { FastifyReply, FastifyRequest } from 'fastify';
import { visitorService } from '../service/visitor-service';
import { ragService } from '../service/rag-service';
import { shareService } from '../service/share-service';
import { usageService } from '../service/usage-service';
import { success } from './result';

/** 简易内存滑动窗口限流（单机 MVP）：per share 60 次/分，per session 10 次/分 */
const rateBuckets = new Map<string, number[]>();

function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  if (rateBuckets.size > 10000) rateBuckets.clear();
  const now = Date.now();
  const timestamps = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    rateBuckets.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  rateBuckets.set(key, timestamps);
  return false;
}

export class VisitorController {
  getMeta(request: FastifyRequest<{ Params: { token: string } }>, reply: FastifyReply) {
    const meta = visitorService.getShareMeta(request.params.token);
    if (!meta) {
      return reply.status(404).send({ code: 404, message: '分享不存在或已停用', data: null });
    }
    const { assistant, share } = meta;
    return reply.send(success({
      token: share.token,
      requires_password: share.mode === 'password',
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
    request: FastifyRequest<{ Params: { token: string }; Body: { visitor_label?: string; password?: string } }>,
    reply: FastifyReply,
  ) {
    const meta = visitorService.getShareMeta(request.params.token);
    if (!meta) {
      return reply.status(404).send({ code: 404, message: '分享不存在或已停用', data: null });
    }
    if (meta.share.mode === 'password' && !shareService.verifyPassword(meta.share, request.body?.password ?? '')) {
      return reply.status(403).send({ code: 403, message: '访问密码错误', data: null });
    }
    const session = visitorService.createSession(meta.share.id, request.body?.visitor_label);
    return reply.status(201).send(success({
      session_id: session.id,
      assistant: meta.assistant.name,
    }));
  }

  async streamMessage(
    request: FastifyRequest<{ Params: { token: string; cid: string }; Body: { message?: string } }>,
    reply: FastifyReply,
  ) {
    const { token, cid } = request.params;
    const message = (request.body?.message ?? '').trim();
    const meta = visitorService.getShareMeta(token);
    if (!meta) {
      return reply.status(404).send({ code: 404, message: '分享不存在或已停用', data: null });
    }
    const session = visitorService.getSession(meta.share.id, Number(cid));
    if (!session) {
      return reply.status(404).send({ code: 404, message: '会话不存在', data: null });
    }
    if (!message) {
      return reply.status(400).send({ code: 400, message: '消息不能为空', data: null });
    }
    if (isRateLimited(`share:${meta.share.id}`, 60, 60000) || isRateLimited(`session:${session.id}`, 10, 60000)) {
      return reply.status(429).send({ code: 429, message: '提问过于频繁，请稍后再试', data: null });
    }

    const startedAt = Date.now();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    const write = (obj: unknown) => reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);

    const history = visitorService.getRecentMessages(session.id, 10)
      .filter((m) => m.role === 'assistant' || (m.role === 'user' && m.content !== message))
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      .slice(-8);

    visitorService.addMessage(session.id, 'user', message);

    try {
      let full = '';
      let sources: string[] = [];
      for await (const part of ragService.streamAnswer({
        assistantId: meta.assistant.id,
        message,
        history,
      })) {
        full += part.delta;
        sources = part.sources;
        write({ type: 'text_delta', content: part.delta });
      }
      visitorService.addMessage(session.id, 'assistant', full, JSON.stringify(sources));
      write({ type: 'done', content: full, sources });
      usageService.record({
        assistantId: meta.assistant.id,
        shareId: meta.share.id,
        latencyMs: Date.now() - startedAt,
        cached: sources.length === 0,
      });
    } catch (err) {
      write({ type: 'error', content: String(err) });
    } finally {
      reply.raw.end();
    }
  }
}
