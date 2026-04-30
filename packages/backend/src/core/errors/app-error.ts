export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError('BAD_REQUEST', message, 400, details);
  }

  static notFound(message: string, details?: unknown): AppError {
    return new AppError('NOT_FOUND', message, 404, details);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError('CONFLICT', message, 409, details);
  }

  static internal(message: string, details?: unknown): AppError {
    return new AppError('INTERNAL_ERROR', message, 500, details);
  }

  static unauthorized(message: string = 'Unauthorized', details?: unknown): AppError {
    return new AppError('UNAUTHORIZED', message, 401, details);
  }

  static forbidden(message: string = 'Forbidden', details?: unknown): AppError {
    return new AppError('FORBIDDEN', message, 403, details);
  }

  static tooManyRequests(message: string = 'Too Many Requests', details?: unknown): AppError {
    return new AppError('TOO_MANY_REQUESTS', message, 429, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', `${resource}${id ? ` with id ${id}` : ''} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', message, 409, details);
    this.name = 'ConflictError';
  }
}
