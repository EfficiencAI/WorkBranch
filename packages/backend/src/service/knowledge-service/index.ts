import { assistantDAO, type KnowledgeSource } from '../../data';

export interface IngestOptions {
  filePath: string;
  title: string;
  type: 'file' | 'text' | 'code';
  size?: number;
}

/**
 * 知识服务（P0 骨架）：仅落库知识源记录。
 * P1 实现完整管道：解析 → 分块 → 向量化 → 索引（sqlite-vec / BM25），
 * 以及对话训练沉淀（固定话术/知识条目）、AI 主动提问的缺口扫描。
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
    assistantDAO.deleteSource(sourceId);
  }

  /** P1：解析 → 分块 → 向量化 → 索引 */
  async ingest(_sourceId: number): Promise<void> {
    throw new Error('知识索引管道将在 P1 实现');
  }
}

export const knowledgeService = new KnowledgeService();
