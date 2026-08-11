import { FastifyInstance } from 'fastify';
import { UserController } from '../controller';
import { requireAuth } from '../middleware/auth';

const controller = new UserController();

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.get('/profile', controller.getUserProfile.bind(controller));
  app.put('/profile/name', controller.updateUserName.bind(controller));
  app.get('/sessions', controller.listSessions.bind(controller));
  app.get('/sessions/:sessionId', controller.getSession.bind(controller));
  app.post('/sessions', controller.createSession.bind(controller));
  app.delete('/sessions/:sessionId', controller.deleteSession.bind(controller));
}
