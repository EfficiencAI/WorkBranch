"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const result_1 = require("../controller/result");
async function errorHandler(error, _request, reply) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    reply.status(statusCode).send((0, result_1.error)(message, statusCode));
}
//# sourceMappingURL=error-handler.js.map