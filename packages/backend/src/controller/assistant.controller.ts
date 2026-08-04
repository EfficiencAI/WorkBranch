import * as fs from 'fs';
import * as path from 'path';
import { FastifyReply, FastifyRequest } from 'fastify';
import { fileStorage } from '../data';
import { assistantService } from '../service/assistant-service';
import { knowledgeService } from '../service/knowledge-service';
import { shareService } from '../service/share-service';
import { success } from './result';

const KNOWLEDGE_DIR = 'assistant-knowledge';

function extToType(filename: string): 'file' | 'text' | 'code' {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  const codeExts = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sql', 'sh']);
  const textExts = new Set(['txt', 'md', 'markdown']);
  if (codeExts.has(ext)) return 'code';
  if (textExts.has(ext)) return 'text';
  return 'file';
}

export class AssistantController {
  async create(
    request: FastifyRequest<{ Body: { name?: string; description?: string; avatar?: string; welcome_message?: string } }>,
    reply: FastifyReply,
  ) {
    const { name, description, avatar, welcome_message } = request.body ?? {};
    if (!name?.trim()) {
      return reply.status(400).send({ code: 400, message: '助手名称不能为空', data: null });
    }
    const assistant = assistantService.create(request.userId!, {
      name: name.trim(),
      description,
      avatar,
      welcome_message,
    });
    return reply.status(201).send(success(assistant));
  }

  list(request: FastifyRequest, reply: FastifyReply) {
    return reply.send(success(assistantService.list(request.userId!)));
  }

  get(request: FastifyRequest<{ Params: { assistantId: string } }>, reply: FastifyReply) {
    try {
      return reply.send(success(assistantService.getOwned(request.userId!, Number(request.params.assistantId))));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  update(
    request: FastifyRequest<{
      Params: { assistantId: string };
      Body: Partial<{ name: string; description: string; avatar: string; welcome_message: string; system_rules: string; status: string }>;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const assistant = assistantService.update(request.userId!, Number(request.params.assistantId), request.body ?? {});
      return reply.send(success(assistant));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  delete(request: FastifyRequest<{ Params: { assistantId: string } }>, reply: FastifyReply) {
    try {
      assistantService.delete(request.userId!, Number(request.params.assistantId));
      return reply.send(success(null));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  async listSources(request: FastifyRequest<{ Params: { assistantId: string } }>, reply: FastifyReply) {
    try {
      assistantService.getOwned(request.userId!, Number(request.params.assistantId));
      return reply.send(success(knowledgeService.listSources(Number(request.params.assistantId))));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  async uploadSource(request: FastifyRequest<{ Params: { assistantId: string } }>, reply: FastifyReply) {
    const assistantId = Number(request.params.assistantId);
    try {
      assistantService.getOwned(request.userId!, assistantId);
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }

    try {
      const file = await request.file();
      if (!file) {
        return reply.status(400).send({ code: 400, message: '未收到文件', data: null });
      }
      const buffer = await file.toBuffer();
      const dir = path.join(fileStorage.getStorageRoot(), KNOWLEDGE_DIR, String(assistantId));
      const safeName = path.basename(file.filename).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
      const filePath = path.join(dir, `${Date.now()}-${safeName}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(buffer));
      const source = knowledgeService.addSource(assistantId, {
        filePath,
        title: file.filename,
        type: extToType(file.filename),
        size: buffer.length,
      });
      return reply.status(201).send(success(source));
    } catch (err) {
      return reply.status(400).send({ code: 400, message: String(err), data: null });
    }
  }

  deleteSource(request: FastifyRequest<{ Params: { assistantId: string; sourceId: string } }>, reply: FastifyReply) {
    try {
      knowledgeService.deleteSource(Number(request.params.assistantId), Number(request.params.sourceId));
      return reply.send(success(null));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  createShare(
    request: FastifyRequest<{
      Params: { assistantId: string };
      Body: { mode?: 'public' | 'password'; password?: string; expires_at?: string };
    }>,
    reply: FastifyReply,
  ) {
    try {
      assistantService.getOwned(request.userId!, Number(request.params.assistantId));
      const { mode, password, expires_at } = request.body ?? {};
      const share = shareService.create(Number(request.params.assistantId), { mode, password, expiresAt: expires_at ?? null });
      return reply.status(201).send(success(share));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  listShares(request: FastifyRequest<{ Params: { assistantId: string } }>, reply: FastifyReply) {
    try {
      assistantService.getOwned(request.userId!, Number(request.params.assistantId));
      return reply.send(success(shareService.list(Number(request.params.assistantId))));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  setShareEnabled(
    request: FastifyRequest<{ Params: { assistantId: string; shareId: string }; Body: { enabled?: boolean } }>,
    reply: FastifyReply,
  ) {
    try {
      const share = shareService.setEnabled(
        Number(request.params.assistantId),
        Number(request.params.shareId),
        request.body?.enabled ?? false,
      );
      return reply.send(success(share));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }
}
