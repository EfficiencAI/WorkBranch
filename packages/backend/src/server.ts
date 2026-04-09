import { buildApp } from './app';
import { logger } from './core/logging';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

async function start() {
  try {
    const app = await buildApp();

    await app.listen({
      port: Number(PORT),
      host: HOST,
    });

    logger.info(`Server listening on http://${HOST}:${PORT}`);
    logger.info(`Health check available at http://${HOST}:${PORT}/health`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

start();
