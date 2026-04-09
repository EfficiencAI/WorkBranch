"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsController = void 0;
const service_1 = require("../service");
const result_1 = require("./result");
class SettingsController {
    async getAllSettings(_request, reply) {
        const settings = service_1.settingsService.getAll();
        return reply.send((0, result_1.success)(settings));
    }
    async getSetting(request, reply) {
        const { key } = request.params;
        try {
            const value = service_1.settingsService.get(key);
            return reply.send((0, result_1.success)(value));
        }
        catch {
            return reply.status(404).send({ code: 404, message: `Setting key not found: ${key}`, data: null });
        }
    }
    async updateSetting(request, reply) {
        const { key } = request.params;
        const { value } = request.body;
        service_1.settingsService.updateSetting(key, value);
        return reply.send((0, result_1.success)(null));
    }
    async updateSettings(request, reply) {
        const updates = request.body;
        service_1.settingsService.updateSettings(updates);
        return reply.send((0, result_1.success)(null));
    }
}
exports.SettingsController = SettingsController;
//# sourceMappingURL=settings.controller.js.map