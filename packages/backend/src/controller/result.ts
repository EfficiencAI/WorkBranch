export interface Result<T = unknown> {
  code: number;
  message: string;
  data: T | null;
}

export function success<T>(data: T | null = null): Result<T> {
  return {
    code: 0,
    message: 'success',
    data,
  };
}

export function error(message: string, code: number = 500): Result {
  return {
    code,
    message,
    data: null,
  };
}
