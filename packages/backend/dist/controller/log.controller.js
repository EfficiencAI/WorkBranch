"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogController = void 0;
const logging_1 = require("../core/logging");
const result_1 = require("./result");
class LogController {
    async log(request, reply) {
        const { level, event, msg, extra, client_ts } = request.body;
        const logMessage = `[frontend][${event}] ${msg || ''}`;
        const logData = { ...extra, client_ts };
        switch (level) {
            case 'ERROR':
                logging_1.logger.error(logData, logMessage);
                break;
            case 'WARNING':
                logging_1.logger.warn(logData, logMessage);
                break;
            default:
                logging_1.logger.info(logData, logMessage);
        }
        return reply.send((0, result_1.success)(null));
    }
}
exports.LogController = LogController;
//# sourceMappingURL=log.controller.js.map