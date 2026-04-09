export declare class AppError extends Error {
    code: string;
    statusCode: number;
    details?: unknown | undefined;
    constructor(code: string, message: string, statusCode?: number, details?: unknown | undefined);
    static badRequest(message: string, details?: unknown): AppError;
    static notFound(message: string, details?: unknown): AppError;
    static conflict(message: string, details?: unknown): AppError;
    static internal(message: string, details?: unknown): AppError;
    static unauthorized(message?: string, details?: unknown): AppError;
    static forbidden(message?: string, details?: unknown): AppError;
    static tooManyRequests(message?: string, details?: unknown): AppError;
}
export declare class ValidationError extends AppError {
    constructor(message: string, details?: unknown);
}
export declare class NotFoundError extends AppError {
    constructor(resource: string, id?: string);
}
export declare class ConflictError extends AppError {
    constructor(message: string, details?: unknown);
}
//# sourceMappingURL=app-error.d.ts.map