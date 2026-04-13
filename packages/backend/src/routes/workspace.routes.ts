import { FastifyInstance } from 'fastify';
import { WorkspaceController } from '../controller';

const controller = new WorkspaceController();

export default async function workspaceRoutes(app: FastifyInstance) {
  app.get('/', controller.listWorkspaces.bind(controller));
  app.get('/:workspaceId', controller.getWorkspace.bind(controller));
  app.get('/:workspaceId/tree', controller.getFileTree.bind(controller));
  app.get('/:workspaceId/files/*', controller.getFile.bind(controller));
  app.delete('/:workspaceId/files/*', controller.deleteFile.bind(controller));
  app.post('/:workspaceId/files', controller.uploadFiles.bind(controller));
}
