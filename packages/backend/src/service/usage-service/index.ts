import { db } from '../../core/database';
import { visitorService } from '../visitor-service';

export interface UsageRecordInput {
  assistantId: number;
  shareId?: number;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  cached?: boolean;
}

export interface AssistantStats {
  todayAnswers: number;
  totalAnswers: number;
  last7d: Array<{ date: string; count: number }>;
  topQuestions: Array<{ question: string; count: number }>;
  gapCount: number;
}

/** 用量服务（P1.5）：每次问答记录一条 usage_records，支持统计看板（不计费） */
class UsageService {
  record(input: UsageRecordInput): void {
    db.prepare(`
      INSERT INTO usage_records (assistant_id, share_id, model, prompt_tokens, completion_tokens, latency_ms, cached)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.assistantId,
      input.shareId ?? null,
      input.model ?? null,
      input.promptTokens ?? null,
      input.completionTokens ?? null,
      input.latencyMs ?? null,
      input.cached ? 1 : 0,
    );
  }

  getStats(assistantId: number): AssistantStats {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const last7d: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      last7d.push({
        date: day.toISOString().slice(0, 10),
        count: this.countBetween(assistantId, day.toISOString(), next.toISOString()),
      });
    }

    return {
      todayAnswers: this.countBetween(assistantId, todayStart.toISOString()),
      totalAnswers: this.countBetween(assistantId, null),
      last7d,
      topQuestions: visitorService.getTopQuestions(assistantId, 5),
      gapCount: visitorService.listGaps(assistantId, 100).length,
    };
  }

  private countBetween(assistantId: number, from: string | null, to: string | null = null): number {
    let sql = 'SELECT COUNT(*) AS c FROM usage_records WHERE assistant_id = ?';
    const params: unknown[] = [assistantId];
    if (from) {
      sql += ' AND created_at >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND created_at < ?';
      params.push(to);
    }
    const row = db.prepare(sql).get<{ c: number }>(...params);
    return Number(row?.c ?? 0);
  }
}

export const usageService = new UsageService();
