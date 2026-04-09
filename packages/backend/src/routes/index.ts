import { FastifyInstance } from 'fastify';
import sessionRoutes from './session.routes';
import conversationRoutes from './conversation.routes';
import userRoutes from './user.routes';
import settingsRoutes from './settings.routes';

export default async function routes(app: FastifyInstance) {
  await app.register(sessionRoutes, { prefix: '/session' });
  await app.register(conversationRoutes, { prefix: '/session/conversations' });
  await app.register(userRoutes, { prefix: '/user' });
  await app.register(settingsRoutes, { prefix: '/settings' });
}
