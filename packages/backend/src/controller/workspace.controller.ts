import { FastifyRequest, FastifyReply } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { workspaceService } from '../service/agent-service';
import { conversationDAO } from '../data';
import { success } from './result';

export class WorkspaceController {
  private ownsWorkspace(userId: number, sessionId: string): boolean {
    const session = conversationDAO.getSessionById(Number(sessionId));
    return !!session && session.user_id === userId;
  }

  async listWorkspaces(request: FastifyRequest, reply: FastifyReply) {
    const workspaceIds = workspaceService.listAll();
    const data = workspaceIds
      .map((id) => {
        const info = workspaceService.getWorkspaceInfo(id);
        if (!info || !this.ownsWorkspace(request.userId!, info.session_id)) return null;
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
    const info = workspaceService.resolveWorkspaceInfo(workspaceId);
    if (!info || !this.ownsWorkspace(request.userId!, info.session_id)) {
      return reply.status(404).send({ code: 404, message: 'Workspace not found', data: null });
    }

    return reply.send(
      success({
        id: info.id,
        session_id: info.session_id,
        status: info.status,
        created_at: info.created_at,
        dir: workspaceService.getWorkspaceDir(info.id),
      })
    );
  }
  async getFileTree(
    request: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = request.params;

    const info = workspaceService.resolveWorkspaceInfo(workspaceId);
    if (!info) {
      return reply.status(404).send({
        code: 404,
        message: `Workspace not found: ${workspaceId}`,
        data: null,
      });
    }
    if (!this.ownsWorkspace(request.userId!, info.session_id)) {
      return reply.status(404).send({
        code: 404,
        message: 'Workspace not found',
        data: null,
      });
    }

    const result = workspaceService.getFileTree(workspaceId);
    if (!result.success) {
      return reply.status(400).send({
        code: 400,
        message: result.error,
        data: null,
      });
    }

    return reply.send(success(result.tree));
  }

  async getFile(
    request: FastifyRequest<{
      Params: { workspaceId: string; '*': string };
      Querystring: { action?: 'content' | 'info' };
    }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = request.params;
    const filePath = request.params['*'];
    const action = request.query.action || 'info';

    const info = workspaceService.resolveWorkspaceInfo(workspaceId);
    if (!info) {
      return reply.status(404).send({
        code: 404,
        message: `Workspace not found: ${workspaceId}`,
        data: null,
      });
    }
    if (!this.ownsWorkspace(request.userId!, info.session_id)) {
      return reply.status(404).send({
        code: 404,
        message: 'Workspace not found',
        data: null,
      });
    }

    if (!filePath) {
      return reply.status(400).send({
        code: 400,
        message: '文件路径不能为空',
        data: null,
      });
    }

    if (action === 'content') {
      const result = workspaceService.getFileContent(workspaceId, filePath);
      if (!result.success) {
        return reply.status(400).send({
          code: 400,
          message: result.error,
          data: null,
        });
      }
      return reply.send(
        success({
          content: result.content,
          encoding: result.encoding,
          size: result.size,
          path: filePath,
        })
      );
    } else {
      const result = workspaceService.getFileInfo(workspaceId, filePath);
      if (!result.success) {
        return reply.status(400).send({
          code: 400,
          message: result.error,
          data: null,
        });
      }
      return reply.send(success(result.info));
    }
  }

  async deleteFile(
    request: FastifyRequest<{ Params: { workspaceId: string; '*': string } }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = request.params;
    const filePath = request.params['*'];

    const info = workspaceService.resolveWorkspaceInfo(workspaceId);
    if (!info) {
      return reply.status(404).send({
        code: 404,
        message: `Workspace not found: ${workspaceId}`,
        data: null,
      });
    }
    if (!this.ownsWorkspace(request.userId!, info.session_id)) {
      return reply.status(404).send({
        code: 404,
        message: 'Workspace not found',
        data: null,
      });
    }

    if (!filePath) {
      return reply.status(400).send({
        code: 400,
        message: '文件路径不能为空',
        data: null,
      });
    }

    const result = workspaceService.deleteFile(workspaceId, filePath);
    if (!result.success) {
      return reply.status(400).send({
        code: 400,
        message: result.error,
        data: null,
      });
    }

    return reply.send(
      success({
        deleted: result.deleted,
        path: result.path,
      })
    );
  }

  async uploadFiles(
    request: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = request.params;

    const info = workspaceService.resolveWorkspaceInfo(workspaceId);
    if (!info) {
      return reply.status(404).send({
        code: 404,
        message: `Workspace not found: ${workspaceId}`,
        data: null,
      });
    }
    if (!this.ownsWorkspace(request.userId!, info.session_id)) {
      return reply.status(404).send({
        code: 404,
        message: 'Workspace not found',
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

      const result = await workspaceService.saveUploadedFiles(info.id, files, subDir);

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
