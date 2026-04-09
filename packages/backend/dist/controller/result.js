"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.success = success;
exports.error = error;
function success(data = null) {
    return {
        code: 0,
        message: 'success',
        data,
    };
}
function error(message, code = 500) {
    return {
        code,
        message,
        data: null,
    };
}
//# sourceMappingURL=result.js.map