import { FastifyInstance } from 'fastify';
import { ConversationController } from '../controller';

const controller = new ConversationController();

export default async function conversationRoutes(app: FastifyInstance) {
  app.get('/:conversationId', controller.getConversation.bind(controller));
  app.get('/:conversationId/messages', controller.getConversationMessages.bind(controller));
  app.get('/:conversationId/context-info', controller.getConversationContextInfo.bind(controller));
  app.post('/:conversationId/messages', controller.sendMessage.bind(controller));
  app.post('/:conversationId/end', controller.endConversation.bind(controller));
  app.post('/:conversationId/cancel', controller.cancelConversation.bind(controller));
  app.delete('/:conversationId', controller.deleteConversation.bind(controller));
  app.delete('/:conversationId/cascade', controller.cascadeDeleteConversation.bind(controller));
}
