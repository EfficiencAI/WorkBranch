import { FastifyRequest, FastifyReply } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { workspaceService } from '../service/agent-service';
import { success } from './result';

export class WorkspaceController {
  async listWorkspaces(_request: FastifyRequest, reply: FastifyReply) {
    const workspaceIds = workspaceService.listAll();
    const data = workspaceIds
      .map((id) => {
        const info = workspaceService.getWorkspaceInfo(id);
        if (!info) return null;
        return {
          ...info,
          dir: workspaceService.getWorkspaceDir(id),
        };
      })
      .filter(Boolean);

    return reply.send(success(data));
  }

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
        data: null,
      });
    }

    return reply.send(
      success({
        id: workspaceId,
        session_id: info.session_id,
        status: info.status,
        created_at: info.created_at,
        dir: workspaceService.getWorkspaceDir(workspaceId),
      })
    );
  }

  async uploadFiles(
    request: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = request.params;

    const info = workspaceService.getWorkspaceInfo(workspaceId);
    if (!info) {
      return reply.status(404).send({
        code: 404,
        message: `Workspace not found: ${workspaceId}`,
        data: null,
      });
    }

    try {
      const files: Array<{ filename: string; content: Buffer }> = [];
      let subDir: string | undefined;

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'sub_dir') {
            subDir = part.value as string;
          }
        } else if (part.type === 'file') {
          const file = part as MultipartFile;
          const buffer = await file.toBuffer();
          files.push({
            filename: file.filename,
            content: buffer,
          });
        }
      }

      const result = await workspaceService.saveUploadedFiles(workspaceId, files, subDir);

      if (!result.success) {
        return reply.status(400).send({
          code: 400,
          message: result.error,
          data: result.files,
        });
      }

      return reply.send(success(result.files));
    } catch (err) {
      return reply.status(500).send({
        code: 500,
        message: String(err),
        data: null,
      });
    }
  }
}
