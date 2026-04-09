"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = routes;
const session_routes_1 = __importDefault(require("./session.routes"));
const conversation_routes_1 = __importDefault(require("./conversation.routes"));
const user_routes_1 = __importDefault(require("./user.routes"));
const settings_routes_1 = __importDefault(require("./settings.routes"));
async function routes(app) {
    await app.register(session_routes_1.default, { prefix: '/session' });
    await app.register(conversation_routes_1.default, { prefix: '/session/conversations' });
    await app.register(user_routes_1.default, { prefix: '/user' });
    await app.register(settings_routes_1.default, { prefix: '/settings' });
}
//# sourceMappingURL=index.js.map