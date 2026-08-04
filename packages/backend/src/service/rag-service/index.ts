export interface RagAnswer {
  content: string;
  sources: string[];
}

export interface RagQuestion {
  assistantId: number;
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * RAG 对话服务（P0 骨架）。
 * P1 实现轻量链路：检索（向量 + BM25）→ 组装 prompt（规则 + 反注入 + 知识上下文）→ LLM 流式返回，
 * 与 LangGraph 代码 Agent 体系分离，共用 LLM service 与缓存。
 */
class RagService {
  async answer(_question: RagQuestion): Promise<RagAnswer> {
    throw new Error('RAG 对话将在 P1 实现');
  }
}

export const ragService = new RagService();
