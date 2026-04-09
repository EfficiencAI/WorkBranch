"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = sessionRoutes;
const controller_1 = require("../controller");
const controller = new controller_1.SessionController();
async function sessionRoutes(app) {
    app.post('/sessions', controller.createSession.bind(controller));
    app.get('/sessions', controller.listSessions.bind(controller));
    app.get('/sessions/:sessionId', controller.getSession.bind(controller));
    app.get('/sessions/:sessionId/conversations', controller.listSessionConversations.bind(controller));
    app.put('/sessions/:sessionId/conversation-positions', controller.updateConversationPositions.bind(controller));
    app.delete('/sessions/:sessionId', controller.deleteSession.bind(controller));
    app.post('/sessions/:sessionId/conversations', controller.createConversation.bind(controller));
}
//# sourceMappingURL=session.routes.js.map