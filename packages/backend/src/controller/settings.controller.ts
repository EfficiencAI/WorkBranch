import { FastifyRequest, FastifyReply } from 'fastify';
import { settingsService } from '../service';
import { success } from './result';

export class SettingsController {
  async getAllSettings(
    request: FastifyRequest<{ Querystring: { key?: string } }>,
    reply: FastifyReply
  ) {
    const { key } = request.query;
    if (key) {
      try {
        const value = settingsService.get(key);
        return reply.send(success(value));
      } catch {
        return reply.status(404).send({ code: 404, message: `Setting key not found: ${key}`, data: null });
      }
    }
    const settings = settingsService.getAll();
    return reply.send(success(settings));
  }

  async getMetadata(_request: FastifyRequest, reply: FastifyReply) {
    const metadata = settingsService.getMetadata();
    return reply.send(success(metadata));
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

  async updateSingleSetting(
    request: FastifyRequest<{ Body: { key: string; value: unknown } }>,
    reply: FastifyReply
  ) {
    const { key, value } = request.body;
    try {
      settingsService.updateSetting(key, value);
      return reply.send(success(null));
    } catch (err) {
      return reply.status(400).send({ code: 400, message: String(err), data: null });
    }
  }

  async updateSetting(
    request: FastifyRequest<{ Params: { key: string }; Body: { value: unknown } }>,
    reply: FastifyReply
  ) {
    const { key } = request.params;
    const { value } = request.body;
    try {
      settingsService.updateSetting(key, value);
      return reply.send(success(null));
    } catch (err) {
      return reply.status(400).send({ code: 400, message: String(err), data: null });
    }
  }

  async updateSettings(request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) {
    const updates = request.body;
    try {
      settingsService.updateSettings(updates);
      return reply.send(success(null));
    } catch (err) {
      return reply.status(400).send({ code: 400, message: String(err), data: null });
    }
  }

  async reloadSettings(_request: FastifyRequest, reply: FastifyReply) {
    settingsService.forceReload();
    return reply.send(success(null));
  }
}
