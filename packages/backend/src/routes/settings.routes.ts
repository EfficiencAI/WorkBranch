import { FastifyInstance } from 'fastify';
import { SettingsController } from '../controller';

const controller = new SettingsController();

export default async function settingsRoutes(app: FastifyInstance) {
  app.get('/', controller.getAllSettings.bind(controller));
  app.get('/:key', controller.getSetting.bind(controller));
  app.put('/:key', controller.updateSetting.bind(controller));
  app.put('/', controller.updateSettings.bind(controller));
}
