import { FastifyReply, FastifyRequest } from 'fastify';
import { authService } from '../service/auth-service';
import { success } from './result';

export class AuthController {
  async register(
    request: FastifyRequest<{ Body: { username?: string; password?: string; display_name?: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const { username, password, display_name } = request.body ?? {};
      const session = authService.register(username ?? '', password ?? '', display_name);
      return reply.status(201).send(success({
        user: session.user,
        token: session.token,
      }));
    } catch (err) {
      return reply.status(400).send({ code: 400, message: String(err), data: null });
    }
  }

  async login(
    request: FastifyRequest<{ Body: { username?: string; password?: string } }>,
    reply: FastifyReply,
  ) {
    try {
      const { username, password } = request.body ?? {};
      const session = authService.login(username ?? '', password ?? '');
      return reply.send(success({
        user: session.user,
        token: session.token,
      }));
    } catch (err) {
      return reply.status(401).send({ code: 401, message: String(err), data: null });
    }
  }

  async me(request: FastifyRequest, reply: FastifyReply) {
    return reply.send(success({ id: request.userId, name: request.userName }));
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    authService.revokeToken(token);
    return reply.send(success(null));
  }
}
