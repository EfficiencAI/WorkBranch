import fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import routes from './routes';
import { appConfig } from './core/config';

export async function buildApp() {
  const isBundle = process.env.NODE_ENV === 'production';

  const app = fastify({
    logger: isBundle ? { level: 'info' } : {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    },
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(sensible);
  await app.register(multipart, {
    limits: {
      fileSize: appConfig.knowledge.uploadMaxBytes,
      files: appConfig.knowledge.uploadMaxFiles,
    },
  });

  app.addHook('onRequest', requestLogger);
  app.setErrorHandler(errorHandler);

  await app.register(routes, { prefix: '/api' });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  return app;
}
