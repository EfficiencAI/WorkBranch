import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../core/logging';
import { success } from './result';

interface LogRequestBody {
  level: 'INFO' | 'WARNING' | 'ERROR';
  event: string;
  msg?: string;
  extra?: Record<string, unknown>;
  client_ts: string;
}

export class LogController {
  async log(request: FastifyRequest<{ Body: LogRequestBody }>, reply: FastifyReply) {
    const { level, event, msg, extra, client_ts } = request.body;

    const logMessage = `[frontend][${event}] ${msg || ''}`;
    const logData = { ...extra, client_ts };

    switch (level) {
      case 'ERROR':
        logger.error(logData, logMessage);
        break;
      case 'WARNING':
        logger.warn(logData, logMessage);
        break;
      default:
        logger.info(logData, logMessage);
    }

    return reply.send(success(null));
  }
}
