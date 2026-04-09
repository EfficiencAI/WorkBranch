import { FastifyRequest, FastifyReply } from 'fastify';
import { workspaceService } from '../service/agent-service';
import { success } from './result';

export class WorkspaceController {
  async getWorkspace(
    request: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = request.params;
    const info = workspaceService.getWorkspaceInfo(workspaceId);

    if (!info) {
      return reply.status(404).send({
        code: 404,
        message: `Workspace not found: ${workspaceId}`,
        data: null
      });
    }

    return reply.send(success({
      id: workspaceId,
      session_id: info.session_id,
      status: info.status,
      created_at: info.created_at,
      dir: workspaceService.getWorkspaceDir(workspaceId),
    }));
  }
}
