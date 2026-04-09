import { z } from 'zod';
declare const configSchema: z.ZodObject<{
    port: z.ZodDefault<z.ZodNumber>;
    host: z.ZodDefault<z.ZodString>;
    database: z.ZodObject<{
        path: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        path: string;
    }, {
        path?: string | undefined;
    }>;
    ai: z.ZodObject<{
        openaiApiKey: z.ZodOptional<z.ZodString>;
        model: z.ZodDefault<z.ZodString>;
        openaiProxy: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        model: string;
        openaiApiKey?: string | undefined;
        openaiProxy?: string | undefined;
    }, {
        openaiApiKey?: string | undefined;
        model?: string | undefined;
        openaiProxy?: string | undefined;
    }>;
    logging: z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        level: z.ZodDefault<z.ZodEnum<["trace", "debug", "info", "warn", "error"]>>;
        frontendEnabled: z.ZodDefault<z.ZodBoolean>;
        apiLogEnabled: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        level: "info" | "error" | "warn" | "debug" | "trace";
        enabled: boolean;
        frontendEnabled: boolean;
        apiLogEnabled: boolean;
    }, {
        level?: "info" | "error" | "warn" | "debug" | "trace" | undefined;
        enabled?: boolean | undefined;
        frontendEnabled?: boolean | undefined;
        apiLogEnabled?: boolean | undefined;
    }>;
    workspace: z.ZodObject<{
        baseDir: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        baseDir: string;
    }, {
        baseDir?: string | undefined;
    }>;
    agent: z.ZodObject<{
        memoryMode: z.ZodDefault<z.ZodEnum<["accumulate", "sliding"]>>;
        memoryWindowSize: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        memoryMode: "accumulate" | "sliding";
        memoryWindowSize: number;
    }, {
        memoryMode?: "accumulate" | "sliding" | undefined;
        memoryWindowSize?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    port: number;
    host: string;
    database: {
        path: string;
    };
    ai: {
        model: string;
        openaiApiKey?: string | undefined;
        openaiProxy?: string | undefined;
    };
    logging: {
        level: "info" | "error" | "warn" | "debug" | "trace";
        enabled: boolean;
        frontendEnabled: boolean;
        apiLogEnabled: boolean;
    };
    workspace: {
        baseDir: string;
    };
    agent: {
        memoryMode: "accumulate" | "sliding";
        memoryWindowSize: number;
    };
}, {
    database: {
        path?: string | undefined;
    };
    ai: {
        openaiApiKey?: string | undefined;
        model?: string | undefined;
        openaiProxy?: string | undefined;
    };
    logging: {
        level?: "info" | "error" | "warn" | "debug" | "trace" | undefined;
        enabled?: boolean | undefined;
        frontendEnabled?: boolean | undefined;
        apiLogEnabled?: boolean | undefined;
    };
    workspace: {
        baseDir?: string | undefined;
    };
    agent: {
        memoryMode?: "accumulate" | "sliding" | undefined;
        memoryWindowSize?: number | undefined;
    };
    port?: number | undefined;
    host?: string | undefined;
}>;
export type AppConfig = z.infer<typeof configSchema>;
export declare const appConfig: {
    port: number;
    host: string;
    database: {
        path: string;
    };
    ai: {
        model: string;
        openaiApiKey?: string | undefined;
        openaiProxy?: string | undefined;
    };
    logging: {
        level: "info" | "error" | "warn" | "debug" | "trace";
        enabled: boolean;
        frontendEnabled: boolean;
        apiLogEnabled: boolean;
    };
    workspace: {
        baseDir: string;
    };
    agent: {
        memoryMode: "accumulate" | "sliding";
        memoryWindowSize: number;
    };
};
export {};
//# sourceMappingURL=index.d.ts.map