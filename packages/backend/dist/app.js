"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const sensible_1 = __importDefault(require("@fastify/sensible"));
const error_handler_1 = require("./middleware/error-handler");
const request_logger_1 = require("./middleware/request-logger");
const routes_1 = __importDefault(require("./routes"));
async function buildApp() {
    const app = (0, fastify_1.default)({
        logger: {
            level: 'info',
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                },
            },
        },
        requestIdHeader: 'x-request-id',
        requestIdLogLabel: 'reqId',
    });
    await app.register(cors_1.default, {
        origin: true,
        credentials: true,
    });
    await app.register(sensible_1.default);
    app.addHook('onRequest', request_logger_1.requestLogger);
    app.setErrorHandler(error_handler_1.errorHandler);
    await app.register(routes_1.default, { prefix: '/api' });
    app.get('/health', async () => {
        return { status: 'ok' };
    });
    return app;
}
//# sourceMappingURL=app.js.map