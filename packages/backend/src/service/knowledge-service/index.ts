import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../core/logging';
import { assistantDAO, fileStorage, type KnowledgeSource } from '../../data';
import { llmService } from '../agent-service/service/llm-service';
import type { KnowledgePackageKind, KnowledgeSourceEntry } from './package-service';

export interface IngestOptions {
  filePath: string;
  title: string;
  type: 'file' | 'text' | 'code' | KnowledgePackageKind;
  size?: number;
  entries?: KnowledgeSourceEntry[];
}

export type KnowledgeSourceView = Omit<KnowledgeSource, 'entry_manifest'> & {
  entries: KnowledgeSourceEntry[];
};

const CHUNK_MAX_CHARS = 1400;
const CHUNK_OVERLAP_CHARS = 120;
const UNSUPPORTED_EXTS = new Set(['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'zip']);

/**
 * 知识服务（P1.1）：
 * 解析（txt/md/code）→ 分块（重叠）→ 向量化（可选，未配 key 时降级为纯关键词）
 * → 写入 knowledge_chunks → 标记索引状态。
 * PDF/DOCX 解析依赖（pdf-parse/mammoth）在 P1.2 补充。
 */
class KnowledgeService {
  addSource(assistantId: number, options: IngestOptions): KnowledgeSourceView {
    const id = assistantDAO.addSource(assistantId, {
      type: options.type,
      title: options.title,
      file_path: options.filePath,
      size: options.size,
      status: 'pending',
      entry_manifest: options.entries ? JSON.stringify(options.entries) : null,
    });
    return this.getSource(assistantId, id);
  }

  listSources(assistantId: number): KnowledgeSourceView[] {
    return assistantDAO.listSources(assistantId).map((source) => this.toView(source));
  }

  getSource(assistantId: number, sourceId: number): KnowledgeSourceView {
    return this.toView(this.getSourceRecord(assistantId, sourceId));
  }

  readSourceContents(assistantId: number, sourceId: number): Array<{ path: string; content: string }> {
    return this.parseSource(this.getSourceRecord(assistantId, sourceId)).map(({ relativePath, text }) => ({
      path: relativePath,
      content: text,
    }));
  }

  private getSourceRecord(assistantId: number, sourceId: number): KnowledgeSource {
    const source = assistantDAO.getSourceById(assistantId, sourceId);
    if (!source) throw new Error('知识源不存在');
    return source;
  }

  deleteSource(assistantId: number, sourceId: number): void {
    const source = this.getSourceRecord(assistantId, sourceId);
    this.deleteStoredSource(assistantId, source);
    assistantDAO.deleteChunks(sourceId);
    assistantDAO.deleteSource(sourceId);
  }

  /** 全量重建索引：版本 +1 → 删除旧 chunk → 解析分块 → 写入（含可选向量化） */
  async reindex(assistantId: number, sourceId: number): Promise<KnowledgeSourceView> {
    this.getSourceRecord(assistantId, sourceId);
    assistantDAO.bumpSourceVersion(sourceId);
    await this.ingest(assistantId, sourceId);
    return this.getSource(assistantId, sourceId);
  }

  async ingest(assistantId: number, sourceId: number): Promise<void> {
    const source = this.getSourceRecord(assistantId, sourceId);
    assistantDAO.setSourceStatus(sourceId, 'processing');
    try {
      const chunks = this.parseSource(source).flatMap(({ relativePath, text }) =>
        this.chunkText(text).map((chunk) => `文件路径：${relativePath}\n\n${chunk}`),
      );
      if (!chunks.length) {
        throw new Error('未提取到可索引的文本内容');
      }

      assistantDAO.deleteChunks(sourceId);

      // 向量化：未配置 API key 或失败时降级为纯关键词检索，不影响索引
      let embeddings: number[][] | null = null;
      if (llmService.isEmbeddingConfigured()) {
        try {
          embeddings = await llmService.embedTexts(chunks);
        } catch (err) {
          logger.warn(`[knowledge] embedding skipped for source ${sourceId}: ${String(err)}`);
        }
      } else {
        logger.info(`[knowledge] embedding 未配置（llm:embedding_base_url），source ${sourceId} 使用纯关键词索引`);
      }

      chunks.forEach((content, index) => {
        assistantDAO.insertChunk(
          sourceId,
          assistantId,
          index + 1,
          content,
          this.estimateTokens(content),
          embeddings ? (embeddings[index] ?? null) : null,
        );
      });

      assistantDAO.setSourceStatus(sourceId, 'indexed', null, chunks.length);
      logger.info(`[knowledge] indexed source ${sourceId}: ${chunks.length} chunks`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      assistantDAO.setSourceStatus(sourceId, 'failed', message);
      throw err;
    }
  }

  private parseSource(source: KnowledgeSource): Array<{ relativePath: string; text: string }> {
    const filePath = source.file_path;
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('源文件不存在');
    }
    const entries = this.parseEntries(source);
    if (source.entry_manifest) {
      if (!fs.statSync(filePath).isDirectory()) throw new Error('知识包存储目录无效');
      return entries.map((entry) => {
        const entryPath = this.resolveEntryPath(filePath, entry.path);
        if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) {
          throw new Error(`知识包文件不存在：${entry.path}`);
        }
        return {
          relativePath: entry.path,
          text: this.decodeUtf8(entry.path, fs.readFileSync(entryPath)),
        };
      });
    }
    const ext = (source.title.split('.').pop() || '').toLowerCase();
    if (UNSUPPORTED_EXTS.has(ext)) {
      throw new Error(`暂不支持 ${ext} 格式解析（P1.2 补充）`);
    }
    return [
      {
        relativePath: source.title,
        text: this.decodeUtf8(source.title, fs.readFileSync(filePath)),
      },
    ];
  }

  private chunkText(text: string): string[] {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];
    const chunks: string[] = [];
    let start = 0;
    while (start < normalized.length) {
      let end = Math.min(start + CHUNK_MAX_CHARS, normalized.length);
      if (end < normalized.length) {
        const lineBreak = normalized.lastIndexOf('\n', end);
        if (lineBreak > start + CHUNK_MAX_CHARS / 2) end = lineBreak;
      }
      const chunk = normalized.slice(start, end).trim();
      if (chunk) chunks.push(chunk);
      if (end >= normalized.length) break;
      start = Math.max(start + 1, end - CHUNK_OVERLAP_CHARS);
    }
    return chunks;
  }

  private parseEntries(source: KnowledgeSource): KnowledgeSourceEntry[] {
    if (!source.entry_manifest) {
      return [{ path: source.title, size: source.size ?? 0 }];
    }
    const parsed: unknown = JSON.parse(source.entry_manifest);
    if (!Array.isArray(parsed)) throw new Error('知识包清单格式无效');
    return parsed.map((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as KnowledgeSourceEntry).path !== 'string' ||
        typeof (entry as KnowledgeSourceEntry).size !== 'number'
      ) {
        throw new Error('知识包清单条目无效');
      }
      return entry as KnowledgeSourceEntry;
    });
  }

  private toView(source: KnowledgeSource): KnowledgeSourceView {
    const { entry_manifest: _manifest, ...view } = source;
    return { ...view, entries: this.parseEntries(source) };
  }

  private resolveEntryPath(rootPath: string, relativePath: string): string {
    const root = path.resolve(rootPath);
    const target = path.resolve(root, ...relativePath.split('/'));
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`知识包清单路径越界：${relativePath}`);
    }
    return target;
  }

  private decodeUtf8(relativePath: string, content: Buffer): string {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(content);
    } catch {
      throw new Error(`文件不是有效的UTF-8文本：${relativePath}`);
    }
  }

  private deleteStoredSource(assistantId: number, source: KnowledgeSource): void {
    if (!source.file_path || !fs.existsSync(source.file_path)) return;
    const managedRoot = path.resolve(fileStorage.getStorageRoot(), 'assistant-knowledge', String(assistantId));
    const target = path.resolve(source.file_path);
    if (!target.startsWith(`${managedRoot}${path.sep}`)) {
      throw new Error('拒绝删除知识库目录外的文件');
    }
    fs.rmSync(target, { recursive: true, force: true });
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 2.5);
  }
}

export const knowledgeService = new KnowledgeService();
