export interface Result<T = unknown> {
    code: number;
    message: string;
    data: T | null;
}
export declare function success<T>(data?: T | null): Result<T>;
export declare function error(message: string, code?: number): Result;
//# sourceMappingURL=result.d.ts.map