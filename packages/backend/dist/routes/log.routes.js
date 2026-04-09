"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = logRoutes;
const controller_1 = require("../controller");
const controller = new controller_1.LogController();
async function logRoutes(app) {
    app.post('/', controller.log.bind(controller));
}
//# sourceMappingURL=log.routes.js.map