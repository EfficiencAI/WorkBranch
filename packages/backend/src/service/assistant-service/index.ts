import * as fs from 'fs';
import * as path from 'path';
import {
  assistantDAO,
  type Assistant,
  type AssistantCreateInput,
  type AssistantFaqRow,
  type TrainingMessageRow,
} from '../../data';
import { fileStorage } from '../../data';
import { knowledgeService } from '../knowledge-service';

export interface CreateFaqInput {
  question: string;
  answer: string;
  kind?: 'faq' | 'knowledge';
}

export interface ExportPackage {
  format: 'workassistant-package';
  version: number;
  assistant: Assistant;
  faqs: AssistantFaqRow[];
  knowledge: Array<{ title: string; type: string; content: string }>;
}

export interface ImportPackage {
  format?: string;
  version?: number;
  assistant: Partial<AssistantCreateInput> & { name: string };
  faqs?: Array<{ question: string; answer: string; kind?: string }>;
  knowledge?: Array<{ title: string; type?: string; content?: string }>;
}

/**
 * 助手服务（P0 骨架）：CRUD + 归属校验。
 * 训练能力（对话对齐、AI 主动提问）在 P1 落地，见知识/规则服务。
 */
class AssistantService {
  create(ownerId: number, input: AssistantCreateInput): Assistant {
    const id = assistantDAO.create(ownerId, input);
    const assistant = assistantDAO.getById(id);
    if (!assistant) throw new Error('创建助手失败');
    return assistant;
  }

  list(ownerId: number): Assistant[] {
    return assistantDAO.listByOwner(ownerId);
  }

  getOwned(ownerId: number, id: number): Assistant {
    const assistant = assistantDAO.getById(id);
    if (!assistant || assistant.owner_id !== ownerId) {
      throw new Error('助手不存在');
    }
    return assistant;
  }

  update(ownerId: number, id: number, input: Partial<AssistantCreateInput>): Assistant {
    this.getOwned(ownerId, id);
    assistantDAO.update(id, input);
    const updated = assistantDAO.getById(id);
    if (!updated) throw new Error('助手不存在');
    return updated;
  }

  delete(ownerId: number, id: number): void {
    this.getOwned(ownerId, id);
    assistantDAO.delete(id);
  }

  listFaqs(ownerId: number, assistantId: number): AssistantFaqRow[] {
    this.getOwned(ownerId, assistantId);
    return assistantDAO.listFaqs(assistantId);
  }

  createFaq(ownerId: number, assistantId: number, input: CreateFaqInput): AssistantFaqRow {
    this.getOwned(ownerId, assistantId);
    const question = input.question.trim();
    const answer = input.answer.trim();
    if (!question || !answer) {
      throw new Error('问题和答案不能为空');
    }
    const id = assistantDAO.createFaq(assistantId, question, answer, input.kind ?? 'faq');
    const faq = assistantDAO.listFaqs(assistantId).find((f) => f.id === id);
    if (!faq) throw new Error('创建固定话术失败');
    return faq;
  }

  updateFaq(ownerId: number, assistantId: number, faqId: number, input: { question: string; answer: string }): AssistantFaqRow {
    this.getOwned(ownerId, assistantId);
    const faq = assistantDAO.listFaqs(assistantId).find((f) => f.id === faqId);
    if (!faq) throw new Error('固定话术不存在');
    assistantDAO.updateFaq(faqId, input.question.trim(), input.answer.trim());
    const updated = assistantDAO.listFaqs(assistantId).find((f) => f.id === faqId);
    if (!updated) throw new Error('固定话术不存在');
    return updated;
  }

  deleteFaq(ownerId: number, assistantId: number, faqId: number): void {
    this.getOwned(ownerId, assistantId);
    const faq = assistantDAO.listFaqs(assistantId).find((f) => f.id === faqId);
    if (!faq) throw new Error('固定话术不存在');
    assistantDAO.deleteFaq(faqId);
  }

  listTrainingMessages(ownerId: number, assistantId: number, limit = 20): TrainingMessageRow[] {
    this.getOwned(ownerId, assistantId);
    return assistantDAO.listTrainingMessages(assistantId, limit);
  }

  addTrainingMessage(ownerId: number, assistantId: number, role: 'user' | 'assistant', content: string): void {
    this.getOwned(ownerId, assistantId);
    assistantDAO.addTrainingMessage(assistantId, role, content);
  }

  /** 导出助手包：助手配置 + 固定话术 + 知识文件内容 */
  exportAssistant(ownerId: number, assistantId: number): ExportPackage {
    const assistant = this.getOwned(ownerId, assistantId);
    const faqs = assistantDAO.listFaqs(assistantId);
    const sources = assistantDAO.listSources(assistantId);
    const knowledge = sources.map((source) => ({
      title: source.title,
      type: source.type,
      content: source.file_path && fs.existsSync(source.file_path) ? fs.readFileSync(source.file_path, 'utf-8') : '',
    }));
    return {
      format: 'workassistant-package',
      version: 1,
      assistant,
      faqs,
      knowledge,
    };
  }

  /** 导入助手包：重建助手 + 写入知识文件并异步索引 + 恢复固定话术 */
  async importAssistant(ownerId: number, pkg: ImportPackage): Promise<Assistant> {
    if (!pkg?.assistant?.name?.trim()) {
      throw new Error('助手包缺少名称');
    }
    const source = pkg.assistant;
    const assistantId = assistantDAO.create(ownerId, {
      name: source.name.trim(),
      description: source.description ?? null,
      avatar: source.avatar ?? null,
      welcome_message: source.welcome_message ?? null,
      system_rules: source.system_rules ?? null,
      model: source.model ?? null,
      base_url: source.base_url ?? null,
      temperature: source.temperature ?? null,
      max_tokens: source.max_tokens ?? null,
      quick_questions: source.quick_questions ?? null,
      status: 'published',
    });

    for (const item of pkg.knowledge ?? []) {
      if (!item?.title) continue;
      const dir = path.join(fileStorage.getStorageRoot(), 'assistant-knowledge', String(assistantId));
      const safeName = path.basename(item.title).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_');
      const filePath = path.join(dir, `${Date.now()}-${safeName}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, item.content ?? '', 'utf-8');
      const sourceId = assistantDAO.addSource(assistantId, {
        type: (item.type as 'file' | 'text' | 'code') ?? 'file',
        title: item.title,
        file_path: filePath,
        status: 'pending',
      });
      void knowledgeService.ingest(assistantId, sourceId).catch(() => {
        // 导入索引失败不阻断导入，状态会标记为 failed
      });
    }

    for (const faq of pkg.faqs ?? []) {
      if (!faq?.question || !faq?.answer) continue;
      assistantDAO.createFaq(assistantId, faq.question, faq.answer, faq.kind ?? 'faq');
    }

    const assistant = assistantDAO.getById(assistantId);
    if (!assistant) throw new Error('创建助手失败');
    return assistant;
  }
}

export const assistantService = new AssistantService();
