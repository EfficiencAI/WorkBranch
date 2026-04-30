import fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import routes from './routes';

export async function buildApp() {
  const app = fastify({
    logger: {
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
  await app.register(multipart);

  app.addHook('onRequest', requestLogger);
  app.setErrorHandler(errorHandler);

  await app.register(routes, { prefix: '/api' });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  return app;
}
