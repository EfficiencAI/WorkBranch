import { FastifyRequest, FastifyReply } from 'fastify';
import { settingsService } from '../service';
import { success } from './result';

export class SettingsController {
  async getAllSettings(_request: FastifyRequest, reply: FastifyReply) {
    const settings = settingsService.getAll();
    return reply.send(success(settings));
  }

  async getSetting(request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) {
    const { key } = request.params;
    try {
      const value = settingsService.get(key);
      return reply.send(success(value));
    } catch {
      return reply.status(404).send({ code: 404, message: `Setting key not found: ${key}`, data: null });
    }
  }

  async updateSetting(
    request: FastifyRequest<{ Params: { key: string }; Body: { value: unknown } }>,
    reply: FastifyReply
  ) {
    const { key } = request.params;
    const { value } = request.body;
    settingsService.updateSetting(key, value);
    return reply.send(success(null));
  }

  async updateSettings(request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) {
    const updates = request.body;
    settingsService.updateSettings(updates);
    return reply.send(success(null));
  }
}
