import { FastifyReply, FastifyRequest } from 'fastify';
import { authService } from '../service/auth-service';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: number;
    userName?: string | null;
  }
}

/** 从 Authorization: Bearer <token> 解析当前登录用户，失败返回 401 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = authService.verifyToken(token);
  if (!user) {
    reply.status(401).send({ code: 401, message: '未登录或登录已失效', data: null });
    return;
  }
  request.userId = user.id;
  request.userName = user.name;
}
