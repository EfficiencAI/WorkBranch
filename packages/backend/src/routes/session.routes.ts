import { FastifyInstance } from 'fastify';
import { SessionController } from '../controller';
import { requireAuth } from '../middleware/auth';

const controller = new SessionController();

export default async function sessionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.post('/sessions', controller.createSession.bind(controller));
  app.get('/sessions', controller.listSessions.bind(controller));
  app.get('/sessions/:sessionId', controller.getSession.bind(controller));
  app.get('/sessions/:sessionId/conversations', controller.listSessionConversations.bind(controller));
  app.put('/sessions/:sessionId/conversation-positions', controller.updateConversationPositions.bind(controller));
  app.delete('/sessions/:sessionId', controller.deleteSession.bind(controller));
  app.post('/sessions/:sessionId/conversations', controller.createConversation.bind(controller));
}
