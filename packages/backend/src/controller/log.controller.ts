import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../core/database';
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

    db.prepare('INSERT INTO logs (level, event, msg, extra_json, client_ts) VALUES (?, ?, ?, ?, ?)')
      .run(level, event, msg ?? null, extra ? JSON.stringify(extra) : null, client_ts ?? null);

    return reply.send(success(null));
  }

  async list(request: FastifyRequest<{ Querystring: { limit?: string; level?: string; event?: string } }>, reply: FastifyReply) {
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 500);
    const { level, event } = request.query;
    let sql = 'SELECT id, level, event, msg, extra_json, client_ts, created_at FROM logs';
    const conditions: string[] = [];
    const params: string[] = [];
    if (level) { conditions.push('level = ?'); params.push(level); }
    if (event) { conditions.push('event = ?'); params.push(event); }
    if (conditions.length > 0) { sql += ' WHERE ' + conditions.join(' AND '); }
    sql += ' ORDER BY id DESC LIMIT ?';
    const rows = db.prepare(sql).all(...params, limit) as Array<Record<string, unknown>>;
    return reply.send(success(rows));
  }
}
