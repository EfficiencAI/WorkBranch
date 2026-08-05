import * as fs from 'fs';
import { logger } from '../../core/logging';
import { assistantDAO, type KnowledgeSource } from '../../data';
import { llmService } from '../agent-service/service/llm-service';

export interface IngestOptions {
  filePath: string;
  title: string;
  type: 'file' | 'text' | 'code';
  size?: number;
}

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
  addSource(assistantId: number, options: IngestOptions): KnowledgeSource {
    const id = assistantDAO.addSource(assistantId, {
      type: options.type,
      title: options.title,
      file_path: options.filePath,
      size: options.size,
      status: 'pending',
    });
    return this.getSource(assistantId, id);
  }

  listSources(assistantId: number): KnowledgeSource[] {
    return assistantDAO.listSources(assistantId);
  }

  getSource(assistantId: number, sourceId: number): KnowledgeSource {
    const source = assistantDAO.listSources(assistantId).find((s) => s.id === sourceId);
    if (!source) throw new Error('知识源不存在');
    return source;
  }

  deleteSource(assistantId: number, sourceId: number): void {
    this.getSource(assistantId, sourceId);
    assistantDAO.deleteChunks(sourceId);
    assistantDAO.deleteSource(sourceId);
  }

  /** 全量重建索引：版本 +1 → 删除旧 chunk → 解析分块 → 写入（含可选向量化） */
  async reindex(assistantId: number, sourceId: number): Promise<KnowledgeSource> {
    this.getSource(assistantId, sourceId);
    assistantDAO.bumpSourceVersion(sourceId);
    await this.ingest(assistantId, sourceId);
    return this.getSource(assistantId, sourceId);
  }

  async ingest(assistantId: number, sourceId: number): Promise<void> {
    const source = this.getSource(assistantId, sourceId);
    assistantDAO.setSourceStatus(sourceId, 'processing');
    try {
      const text = this.parseSource(source);
      const chunks = this.chunkText(text);
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
          embeddings ? embeddings[index] ?? null : null,
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

  private parseSource(source: KnowledgeSource): string {
    const filePath = source.file_path;
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('源文件不存在');
    }
    const ext = (source.title.split('.').pop() || '').toLowerCase();
    if (UNSUPPORTED_EXTS.has(ext)) {
      throw new Error(`暂不支持 ${ext} 格式解析（P1.2 补充）`);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  private chunkText(text: string): string[] {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];
    const blocks = normalized.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b.length > 0);
    const chunks: string[] = [];
    let current = '';
    for (const block of blocks) {
      if (current && current.length + block.length + 2 > CHUNK_MAX_CHARS) {
        chunks.push(current);
        current = current.slice(-CHUNK_OVERLAP_CHARS) + '\n' + block;
      } else {
        current = current ? `${current}\n${block}` : block;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 2.5);
  }
}

export const knowledgeService = new KnowledgeService();
