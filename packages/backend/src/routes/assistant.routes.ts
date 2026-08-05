import { FastifyInstance } from 'fastify';
import { AssistantController } from '../controller';
import { requireAuth } from '../middleware/auth';

const controller = new AssistantController();

export default async function assistantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/', controller.create.bind(controller));
  app.get('/', controller.list.bind(controller));
  app.get('/:assistantId', controller.get.bind(controller));
  app.put('/:assistantId', controller.update.bind(controller));
  app.delete('/:assistantId', controller.delete.bind(controller));

  app.get('/:assistantId/sources', controller.listSources.bind(controller));
  app.post('/:assistantId/sources', controller.uploadSource.bind(controller));
  app.delete('/:assistantId/sources/:sourceId', controller.deleteSource.bind(controller));
  app.post('/:assistantId/sources/:sourceId/reindex', controller.reindexSource.bind(controller));

  app.post('/:assistantId/shares', controller.createShare.bind(controller));
  app.get('/:assistantId/shares', controller.listShares.bind(controller));
  app.put('/:assistantId/shares/:shareId', controller.setShareEnabled.bind(controller));
}
