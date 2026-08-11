import { FastifyInstance } from 'fastify';
import { SettingsController } from '../controller';
import { requireAuth } from '../middleware/auth';

const controller = new SettingsController();

export default async function settingsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);
  app.get('/', controller.getAllSettings.bind(controller));
  app.get('/metadata', controller.getMetadata.bind(controller));
  app.get('/:key', controller.getSetting.bind(controller));
  app.put('/:key', controller.updateSetting.bind(controller));
  app.put('/', controller.updateSingleSetting.bind(controller));
  app.patch('/', controller.updateSettings.bind(controller));
  app.post('/reload', controller.reloadSettings.bind(controller));
  app.post('/llm/test', controller.testLlmConnection.bind(controller));
}
