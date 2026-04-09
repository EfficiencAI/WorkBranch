"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = userRoutes;
const controller_1 = require("../controller");
const controller = new controller_1.UserController();
async function userRoutes(app) {
    app.get('/profile', controller.getUserProfile.bind(controller));
    app.put('/profile/name', controller.updateUserName.bind(controller));
    app.get('/sessions', controller.listSessions.bind(controller));
    app.get('/sessions/:sessionId', controller.getSession.bind(controller));
    app.post('/sessions', controller.createSession.bind(controller));
    app.delete('/sessions/:sessionId', controller.deleteSession.bind(controller));
}
//# sourceMappingURL=user.routes.js.map