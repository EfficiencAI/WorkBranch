import {
  assistantDAO,
  type Assistant,
  type AssistantCreateInput,
  type AssistantFaqRow,
  type TrainingMessageRow,
} from '../../data';

export interface CreateFaqInput {
  question: string;
  answer: string;
  kind?: 'faq' | 'knowledge';
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
}

export const assistantService = new AssistantService();
