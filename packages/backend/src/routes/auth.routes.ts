import { FastifyInstance } from 'fastify';
import { AuthController } from '../controller';
import { requireAuth } from '../middleware/auth';

const controller = new AuthController();

export default async function authRoutes(app: FastifyInstance) {
  app.post('/register', controller.register.bind(controller));
  app.post('/login', controller.login.bind(controller));

  await app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', requireAuth);
    protectedApp.get('/me', controller.me.bind(controller));
    protectedApp.post('/logout', controller.logout.bind(controller));
  });
}
