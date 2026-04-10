"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = settingsRoutes;
const controller_1 = require("../controller");
const controller = new controller_1.SettingsController();
async function settingsRoutes(app) {
    app.get('/', controller.getAllSettings.bind(controller));
    app.get('/metadata', controller.getMetadata.bind(controller));
    app.get('/:key', controller.getSetting.bind(controller));
    app.put('/:key', controller.updateSetting.bind(controller));
    app.put('/', controller.updateSettings.bind(controller));
}
//# sourceMappingURL=settings.routes.js.map