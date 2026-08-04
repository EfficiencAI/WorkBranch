import { z } from 'zod';
import * as path from 'path';

function getDataDir(): string {
  const cwd = process.cwd();
  if (cwd === '/' || cwd === '/system') {
    return process.env.FILES_DIR || '/data/data/com.workbranch.app/files';
  }
  return cwd;
}

const dataDir = getDataDir();

const configSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('127.0.0.1'),
  database: z.object({
    path: z.string().default('./data/workbranch.db'),
  }),
  ai: z.object({
    openaiApiKey: z.string().optional(),
    model: z.string().default('gpt-4'),
    openaiProxy: z.string().optional(),
  }),
  logging: z.object({
    enabled: z.boolean().default(true),
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    frontendEnabled: z.boolean().default(true),
    apiLogEnabled: z.boolean().default(true),
  }),
  workspace: z.object({
    baseDir: z.string().default('workspaces'),
  }),
  agent: z.object({
    memoryMode: z.enum(['accumulate', 'sliding']).default('accumulate'),
    memoryWindowSize: z.number().default(3),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

function loadConfig(): AppConfig {
  const dbPath = process.env.DATABASE_PATH 
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(dataDir, 'data', 'workbranch.db');
    
  return configSchema.parse({
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || '127.0.0.1',
    database: {
      path: dbPath,
    },
    ai: {
      openaiApiKey: process.env.OPENAI_API_KEY,
      model: process.env.AI_MODEL || 'gpt-4',
      openaiProxy: process.env.OPENAI_PROXY,
    },
    logging: {
      enabled: process.env.LOGGING_ENABLED !== 'false',
      level: (process.env.LOG_LEVEL as AppConfig['logging']['level']) || 'info',
      frontendEnabled: process.env.LOGGING_FRONTEND_ENABLED !== 'false',
      apiLogEnabled: process.env.LOGGING_API_ENABLED !== 'false',
    },
    workspace: {
      baseDir: process.env.WORKSPACE_BASE_DIR || 'workspaces',
    },
    agent: {
      memoryMode: (process.env.AGENT_MEMORY_MODE as AppConfig['agent']['memoryMode']) || 'accumulate',
      memoryWindowSize: Number(process.env.AGENT_MEMORY_WINDOW_SIZE) || 3,
    },
  });
}

export const appConfig = loadConfig();
