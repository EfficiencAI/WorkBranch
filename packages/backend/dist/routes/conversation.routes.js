"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = conversationRoutes;
const controller_1 = require("../controller");
const controller = new controller_1.ConversationController();
async function conversationRoutes(app) {
    app.get('/:conversationId', controller.getConversation.bind(controller));
    app.get('/:conversationId/messages', controller.getConversationMessages.bind(controller));
    app.get('/:conversationId/context-info', controller.getConversationContextInfo.bind(controller));
    app.post('/:conversationId/messages', controller.sendMessage.bind(controller));
    app.post('/:conversationId/end', controller.endConversation.bind(controller));
    app.post('/:conversationId/cancel', controller.cancelConversation.bind(controller));
    app.delete('/:conversationId', controller.deleteConversation.bind(controller));
    app.delete('/:conversationId/cascade', controller.cascadeDeleteConversation.bind(controller));
}
//# sourceMappingURL=conversation.routes.js.map