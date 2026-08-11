import { FastifyInstance } from 'fastify';
import { VisitorController } from '../controller';

const controller = new VisitorController();

export default async function visitorRoutes(app: FastifyInstance) {
  app.get('/:token', controller.getMeta.bind(controller));
  app.post('/:token/conversations', controller.createConversation.bind(controller));
  app.post('/:token/conversations/:cid/messages', controller.streamMessage.bind(controller));
}
