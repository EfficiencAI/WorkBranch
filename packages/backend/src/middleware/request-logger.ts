import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { logger } from '../core/logging';

export function requestLogger(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
) {
  const start = Date.now();

  request.log.info({
    method: request.method,
    url: request.url,
    headers: request.headers,
  });

  reply.raw.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      event: 'request.completed',
      method: request.method,
      url: request.url,
      status: reply.statusCode,
      duration_ms: duration,
    });
  });

  done();
}
