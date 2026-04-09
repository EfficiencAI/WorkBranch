"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appConfig = void 0;
const zod_1 = require("zod");
const configSchema = zod_1.z.object({
    port: zod_1.z.number().default(3000),
    host: zod_1.z.string().default('127.0.0.1'),
    database: zod_1.z.object({
        path: zod_1.z.string().default('./data/workbranch.db'),
    }),
    ai: zod_1.z.object({
        openaiApiKey: zod_1.z.string().optional(),
        model: zod_1.z.string().default('gpt-4'),
        openaiProxy: zod_1.z.string().optional(),
    }),
    logging: zod_1.z.object({
        enabled: zod_1.z.boolean().default(true),
        level: zod_1.z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
        frontendEnabled: zod_1.z.boolean().default(true),
        apiLogEnabled: zod_1.z.boolean().default(true),
    }),
    workspace: zod_1.z.object({
        baseDir: zod_1.z.string().default('workspaces'),
    }),
    agent: zod_1.z.object({
        memoryMode: zod_1.z.enum(['accumulate', 'sliding']).default('accumulate'),
        memoryWindowSize: zod_1.z.number().default(3),
    }),
});
function loadConfig() {
    return configSchema.parse({
        port: Number(process.env.PORT) || 3000,
        host: process.env.HOST || '127.0.0.1',
        database: {
            path: process.env.DATABASE_PATH || './data/workbranch.db',
        },
        ai: {
            openaiApiKey: process.env.OPENAI_API_KEY,
            model: process.env.AI_MODEL || 'gpt-4',
            openaiProxy: process.env.OPENAI_PROXY,
        },
        logging: {
            enabled: process.env.LOGGING_ENABLED !== 'false',
            level: process.env.LOG_LEVEL || 'info',
            frontendEnabled: process.env.LOGGING_FRONTEND_ENABLED !== 'false',
            apiLogEnabled: process.env.LOGGING_API_ENABLED !== 'false',
        },
        workspace: {
            baseDir: process.env.WORKSPACE_BASE_DIR || 'workspaces',
        },
        agent: {
            memoryMode: process.env.AGENT_MEMORY_MODE || 'accumulate',
            memoryWindowSize: Number(process.env.AGENT_MEMORY_WINDOW_SIZE) || 3,
        },
    });
}
exports.appConfig = loadConfig();
//# sourceMappingURL=index.js.map