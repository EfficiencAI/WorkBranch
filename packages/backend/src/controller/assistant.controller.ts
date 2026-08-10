import * as path from 'path';
import { FastifyReply, FastifyRequest } from 'fastify';
import { appConfig } from '../core/config';
import { logger } from '../core/logging';
import { fileStorage, type AssistantCreateInput } from '../data';
import { assistantService } from '../service/assistant-service';
import { knowledgeService } from '../service/knowledge-service';
import { knowledgePackageService, type KnowledgePackageKind, type KnowledgeUploadFile } from '../service/knowledge-service/package-service';
import { ragService } from '../service/rag-service';
import { shareService } from '../service/share-service';
import { usageService } from '../service/usage-service';
import { success } from './result';

function extToType(filename: string): 'file' | 'text' | 'code' {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  const codeExts = new Set(['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sql', 'sh']);
  const textExts = new Set(['txt', 'md', 'markdown']);
  if (codeExts.has(ext)) return 'code';
  if (textExts.has(ext)) return 'text';
  return 'file';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
      Body: Partial<{ name: string; description: string; avatar: string; welcome_message: string; system_rules: string; quick_questions: string[]; status: string }>;
    }>,
    reply: FastifyReply,
  ) {
    try {
      const body = request.body ?? {};
      const { quick_questions, ...rest } = body;
      const input: Partial<AssistantCreateInput> = {
        ...rest,
        ...(quick_questions !== undefined
          ? { quick_questions: Array.isArray(quick_questions) ? JSON.stringify(quick_questions) : (quick_questions as string) }
          : {}),
      };
      const assistant = assistantService.update(request.userId!, Number(request.params.assistantId), input);
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
      let requestedKind: string | undefined;
      let requestedTitle: string | undefined;
      let rawRelativePaths: string | undefined;
      let uploadSize = 0;
      const uploadedFiles: Array<{ filename: string; content: Buffer }> = [];
      for await (const part of request.parts()) {
        if (part.type === 'field') {
          const value = String(part.value);
          if (part.fieldname === 'kind') requestedKind = value;
          else if (part.fieldname === 'title') requestedTitle = value;
          else if (part.fieldname === 'relative_paths') rawRelativePaths = value;
          else throw new Error(`未知上传字段：${part.fieldname}`);
          continue;
        }
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          uploadSize += buffer.length;
          if (uploadSize > appConfig.knowledge.uploadMaxBytes) {
            throw new Error(`知识源大小超过限制（${appConfig.knowledge.uploadMaxBytes}字节）`);
          }
          chunks.push(buffer);
        }
        if (part.file.truncated) throw new Error(`文件大小超过限制：${part.filename}`);
        uploadedFiles.push({ filename: part.filename, content: Buffer.concat(chunks) });
      }
      if (uploadedFiles.length === 0) throw new Error('未收到文件');

      const inferredKind =
        uploadedFiles.length === 1 && path.extname(uploadedFiles[0].filename).toLowerCase() === '.zip' ? 'archive' : 'file';
      const kind = requestedKind ?? inferredKind;
      if (kind !== 'file' && kind !== 'directory' && kind !== 'archive') {
        throw new Error(`不支持的知识源类型：${kind}`);
      }
      if (kind === 'file' && uploadedFiles.length !== 1) {
        throw new Error('普通文件知识源每次只能上传一个文件');
      }

      let relativePaths = uploadedFiles.map((file) => file.filename);
      if (rawRelativePaths !== undefined) {
        const parsed: unknown = JSON.parse(rawRelativePaths);
        if (!Array.isArray(parsed) || parsed.length !== uploadedFiles.length || parsed.some((item) => typeof item !== 'string')) {
          throw new Error('文件相对路径清单无效');
        }
        relativePaths = parsed as string[];
      } else if (kind === 'directory') {
        throw new Error('文件夹上传缺少相对路径清单');
      }

      const files: KnowledgeUploadFile[] = uploadedFiles.map((file, index) => ({
        relativePath: relativePaths[index],
        content: file.content,
      }));
      const packageKind = kind as KnowledgePackageKind;
      const prepared = await knowledgePackageService.prepare(fileStorage.getStorageRoot(), assistantId, {
        kind: packageKind,
        title: requestedTitle ?? uploadedFiles[0].filename,
        files,
      });
      let source;
      try {
        source = knowledgeService.addSource(assistantId, {
          filePath: prepared.storagePath,
          title: prepared.title,
          type: prepared.kind === 'file' ? extToType(prepared.title) : prepared.kind,
          size: prepared.size,
          entries: prepared.entries,
        });
      } catch (error) {
        knowledgePackageService.remove(prepared.storagePath);
        throw error;
      }
      void knowledgeService.ingest(assistantId, source.id).catch((err) => {
        logger.error(`[knowledge] ingest failed for source ${source.id}: ${String(err)}`);
      });
      return reply.status(201).send(success(source));
    } catch (err) {
      return reply.status(400).send({ code: 400, message: errorMessage(err), data: null });
    }
  }

  deleteSource(request: FastifyRequest<{ Params: { assistantId: string; sourceId: string } }>, reply: FastifyReply) {
    try {
      assistantService.getOwned(request.userId!, Number(request.params.assistantId));
      knowledgeService.deleteSource(Number(request.params.assistantId), Number(request.params.sourceId));
      return reply.send(success(null));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  async reindexSource(request: FastifyRequest<{ Params: { assistantId: string; sourceId: string } }>, reply: FastifyReply) {
    const assistantId = Number(request.params.assistantId);
    const sourceId = Number(request.params.sourceId);
    try {
      assistantService.getOwned(request.userId!, assistantId);
      const source = await knowledgeService.reindex(assistantId, sourceId);
      return reply.send(success(source));
    } catch (err) {
      return reply.status(400).send({ code: 400, message: String(err), data: null });
    }
  }

  async streamTrainMessage(
    request: FastifyRequest<{ Params: { assistantId: string }; Body: { message?: string } }>,
    reply: FastifyReply,
  ) {
    const assistantId = Number(request.params.assistantId);
    const message = (request.body?.message ?? '').trim();
    try {
      assistantService.getOwned(request.userId!, assistantId);
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
    if (!message) {
      return reply.status(400).send({ code: 400, message: '消息不能为空', data: null });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': request.headers.origin ?? '*',
      'Access-Control-Allow-Credentials': 'true',
    });
    const write = (obj: unknown) => reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    const startedAt = Date.now();

    const history = assistantService.listTrainingMessages(request.userId!, assistantId, 20)
      .filter((m) => m.role === 'assistant' || (m.role === 'user' && m.content !== message))
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      .slice(-8);
    assistantService.addTrainingMessage(request.userId!, assistantId, 'user', message);

    try {
      let full = '';
      let sources: string[] = [];
      for await (const part of ragService.streamAnswer({ assistantId, message, history })) {
        full += part.delta;
        sources = part.sources;
        write({ type: 'text_delta', content: part.delta });
      }
      assistantService.addTrainingMessage(request.userId!, assistantId, 'assistant', full);
      write({ type: 'done', content: full, sources });
      usageService.record({
        assistantId,
        latencyMs: Date.now() - startedAt,
        cached: sources.length === 0,
      });
    } catch (err) {
      write({ type: 'error', content: String(err) });
    } finally {
      reply.raw.end();
    }
  }

  createFaq(
    request: FastifyRequest<{
      Params: { assistantId: string };
      Body: { question?: string; answer?: string; kind?: 'faq' | 'knowledge' };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const faq = assistantService.createFaq(request.userId!, Number(request.params.assistantId), {
        question: request.body?.question ?? '',
        answer: request.body?.answer ?? '',
        kind: request.body?.kind,
      });
      return reply.status(201).send(success(faq));
    } catch (err) {
      return reply.status(400).send({ code: 400, message: String(err), data: null });
    }
  }

  listFaqs(request: FastifyRequest<{ Params: { assistantId: string } }>, reply: FastifyReply) {
    try {
      return reply.send(success(assistantService.listFaqs(request.userId!, Number(request.params.assistantId))));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  updateFaq(
    request: FastifyRequest<{
      Params: { assistantId: string; faqId: string };
      Body: { question?: string; answer?: string };
    }>,
    reply: FastifyReply,
  ) {
    try {
      const faq = assistantService.updateFaq(
        request.userId!,
        Number(request.params.assistantId),
        Number(request.params.faqId),
        { question: request.body?.question ?? '', answer: request.body?.answer ?? '' },
      );
      return reply.send(success(faq));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  deleteFaq(request: FastifyRequest<{ Params: { assistantId: string; faqId: string } }>, reply: FastifyReply) {
    try {
      assistantService.deleteFaq(request.userId!, Number(request.params.assistantId), Number(request.params.faqId));
      return reply.send(success(null));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  listGaps(request: FastifyRequest<{ Params: { assistantId: string } }>, reply: FastifyReply) {
    try {
      assistantService.getOwned(request.userId!, Number(request.params.assistantId));
      return reply.send(success(ragService.aiCheck(Number(request.params.assistantId)).gaps));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  runAiCheck(request: FastifyRequest<{ Params: { assistantId: string } }>, reply: FastifyReply) {
    try {
      assistantService.getOwned(request.userId!, Number(request.params.assistantId));
      return reply.send(success(ragService.aiCheck(Number(request.params.assistantId))));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  exportAssistant(request: FastifyRequest<{ Params: { assistantId: string } }>, reply: FastifyReply) {
    try {
      return reply.send(success(assistantService.exportAssistant(request.userId!, Number(request.params.assistantId))));
    } catch (err) {
      return reply.status(404).send({ code: 404, message: String(err), data: null });
    }
  }

  async importAssistant(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) {
    try {
      const assistant = await assistantService.importAssistant(request.userId!, request.body as never);
      return reply.status(201).send(success(assistant));
    } catch (err) {
      return reply.status(400).send({ code: 400, message: String(err), data: null });
    }
  }

  getStats(request: FastifyRequest<{ Params: { assistantId: string } }>, reply: FastifyReply) {
    try {
      assistantService.getOwned(request.userId!, Number(request.params.assistantId));
      return reply.send(success(usageService.getStats(Number(request.params.assistantId))));
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
