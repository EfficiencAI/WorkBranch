import { buildApp } from './app';
import { logger } from './core/logging';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

async function start() {
  try {
    console.log('[DEBUG-SERVER] === server.ts start() BEGIN ===');
    console.log('[DEBUG-SERVER] PORT=' + PORT + ' HOST=' + HOST);
    console.log('[DEBUG-SERVER] NODE_ENV=' + process.env.NODE_ENV);
    console.log('[DEBUG-SERVER] FILES_DIR=' + process.env.FILES_DIR);
    console.log('[DEBUG-SERVER] cwd=' + process.cwd());

    console.log('[DEBUG-SERVER] about to call buildApp()');
    const app = await buildApp();
    console.log('[DEBUG-SERVER] buildApp() returned OK');

    console.log('[DEBUG-SERVER] about to call app.listen()');
    await app.listen({
      port: Number(PORT),
      host: HOST,
    });

    logger.info(`Server listening on http://${HOST}:${PORT}`);
    logger.info(`Health check available at http://${HOST}:${PORT}/health`);
    console.log('[DEBUG-SERVER] === server.ts start() OK ===');
  } catch (err) {
    console.error('[DEBUG-SERVER] === server.ts start() ERROR ===', err);
    logger.error(err);
    process.exit(1);
  }
}

console.log('[DEBUG-SERVER] about to call start()');
start();
