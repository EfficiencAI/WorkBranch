"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
const logging_1 = require("../core/logging");
function requestLogger(request, reply, done) {
    const start = Date.now();
    request.log.info({
        method: request.method,
        url: request.url,
        headers: request.headers,
    });
    reply.raw.on('finish', () => {
        const duration = Date.now() - start;
        logging_1.logger.info({
            event: 'request.completed',
            method: request.method,
            url: request.url,
            status: reply.statusCode,
            duration_ms: duration,
        });
    });
    done();
}
//# sourceMappingURL=request-logger.js.map