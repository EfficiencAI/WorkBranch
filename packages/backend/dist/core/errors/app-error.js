"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictError = exports.NotFoundError = exports.ValidationError = exports.AppError = void 0;
class AppError extends Error {
    code;
    statusCode;
    details;
    constructor(code, message, statusCode = 500, details) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.name = 'AppError';
    }
    static badRequest(message, details) {
        return new AppError('BAD_REQUEST', message, 400, details);
    }
    static notFound(message, details) {
        return new AppError('NOT_FOUND', message, 404, details);
    }
    static conflict(message, details) {
        return new AppError('CONFLICT', message, 409, details);
    }
    static internal(message, details) {
        return new AppError('INTERNAL_ERROR', message, 500, details);
    }
    static unauthorized(message = 'Unauthorized', details) {
        return new AppError('UNAUTHORIZED', message, 401, details);
    }
    static forbidden(message = 'Forbidden', details) {
        return new AppError('FORBIDDEN', message, 403, details);
    }
    static tooManyRequests(message = 'Too Many Requests', details) {
        return new AppError('TOO_MANY_REQUESTS', message, 429, details);
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message, details) {
        super('VALIDATION_ERROR', message, 400, details);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends AppError {
    constructor(resource, id) {
        super('NOT_FOUND', `${resource}${id ? ` with id ${id}` : ''} not found`, 404);
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message, details) {
        super('CONFLICT', message, 409, details);
        this.name = 'ConflictError';
    }
}
exports.ConflictError = ConflictError;
//# sourceMappingURL=app-error.js.map