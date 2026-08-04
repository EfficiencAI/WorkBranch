export interface UsageRecordInput {
  assistantId: number;
  shareId?: number;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  cached?: boolean;
}

/**
 * 用量服务（P0 骨架）。
 * P1 落地：每次 LLM 调用记录 token/延迟/缓存命中，支撑统计看板与预算控制（不涉及计费）。
 */
class UsageService {
  record(_input: UsageRecordInput): void {
    // P1 实现
  }
}

export const usageService = new UsageService();
