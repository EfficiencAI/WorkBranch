import { assistantDAO, type Assistant, type AssistantCreateInput } from '../../data';

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
}

export const assistantService = new AssistantService();
