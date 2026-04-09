"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.createLogger = createLogger;
exports.bindContext = bindContext;
exports.getContext = getContext;
exports.clearContext = clearContext;
const pino_1 = __importDefault(require("pino"));
const isDev = process.env.NODE_ENV !== 'production';
exports.logger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL || 'info',
    transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
            },
        }
        : undefined,
});
function createLogger(name) {
    return exports.logger.child({ name });
}
const contextStorage = new Map();
function bindContext(ctx) {
    const requestId = ctx.requestId || 'default';
    contextStorage.set(requestId, { ...contextStorage.get(requestId), ...ctx });
}
function getContext(requestId) {
    return contextStorage.get(requestId || 'default');
}
function clearContext(requestId) {
    if (requestId) {
        contextStorage.delete(requestId);
    }
    else {
        contextStorage.clear();
    }
}
//# sourceMappingURL=logger.js.map