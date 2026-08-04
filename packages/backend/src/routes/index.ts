import { FastifyInstance } from 'fastify';
import sessionRoutes from './session.routes';
import conversationRoutes from './conversation.routes';
import userRoutes from './user.routes';
import settingsRoutes from './settings.routes';
import logRoutes from './log.routes';
import workspaceRoutes from './workspace.routes';

export default async function routes(app: FastifyInstance) {
  await app.register(sessionRoutes, { prefix: '/session' });
  await app.register(conversationRoutes, { prefix: '/session/conversations' });
  await app.register(userRoutes, { prefix: '/user' });
  await app.register(settingsRoutes, { prefix: '/settings' });
  await app.register(logRoutes, { prefix: '/logs' });
  await app.register(workspaceRoutes, { prefix: '/workspaces' });
}
