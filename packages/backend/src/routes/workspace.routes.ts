import { FastifyInstance } from 'fastify';
import { WorkspaceController } from '../controller';

const controller = new WorkspaceController();

export default async function workspaceRoutes(app: FastifyInstance) {
  app.get('/:workspaceId', controller.getWorkspace.bind(controller));
}
