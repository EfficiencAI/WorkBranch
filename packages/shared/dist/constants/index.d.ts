export declare const APP_NAME = "WorkBranch";
export declare const DEFAULT_PORT = 3000;
export declare const DEFAULT_HOST = "127.0.0.1";
export declare const API_PREFIX = "/api";
export declare const ErrorCode: {
    readonly UNKNOWN: "UNKNOWN";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly DATABASE_ERROR: "DATABASE_ERROR";
    readonly AI_SERVICE_ERROR: "AI_SERVICE_ERROR";
};
export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];
//# sourceMappingURL=index.d.ts.map