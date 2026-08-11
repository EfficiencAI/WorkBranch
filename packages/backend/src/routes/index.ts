import { FastifyInstance } from 'fastify';
import sessionRoutes from './session.routes';
import conversationRoutes from './conversation.routes';
import userRoutes from './user.routes';
import settingsRoutes from './settings.routes';
import logRoutes from './log.routes';
import workspaceRoutes from './workspace.routes';
import authRoutes from './auth.routes';
import assistantRoutes from './assistant.routes';
import visitorRoutes from './visitor.routes';

export default async function routes(app: FastifyInstance) {
  await app.register(sessionRoutes, { prefix: '/session' });
  await app.register(conversationRoutes, { prefix: '/session/conversations' });
  await app.register(userRoutes, { prefix: '/user' });
  await app.register(settingsRoutes, { prefix: '/settings' });
  await app.register(logRoutes, { prefix: '/logs' });
  await app.register(workspaceRoutes, { prefix: '/workspaces' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(assistantRoutes, { prefix: '/assistants' });
  await app.register(visitorRoutes, { prefix: '/share' });
}
