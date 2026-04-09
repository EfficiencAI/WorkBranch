"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = workspaceRoutes;
const controller_1 = require("../controller");
const controller = new controller_1.WorkspaceController();
async function workspaceRoutes(app) {
    app.get('/:workspaceId', controller.getWorkspace.bind(controller));
}
//# sourceMappingURL=workspace.routes.js.map