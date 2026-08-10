import { FastifyInstance } from 'fastify';
import { LogController } from '../controller';
import { requireAuth } from '../middleware/auth';

const controller = new LogController();

export default async function logRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.post('/', controller.log.bind(controller));
  app.get('/', controller.list.bind(controller));
}
