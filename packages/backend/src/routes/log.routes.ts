import { FastifyInstance } from 'fastify';
import { LogController } from '../controller';

const controller = new LogController();

export default async function logRoutes(app: FastifyInstance) {
  app.post('/', controller.log.bind(controller));
}
