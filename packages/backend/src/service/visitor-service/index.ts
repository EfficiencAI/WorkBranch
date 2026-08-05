import { db } from '../../core/database';
import { assistantDAO, type Assistant, type ShareInfo } from '../../data';

export interface VisitorSession {
  id: number;
  share_id: number;
  visitor_label: string | null;
  created_at: string;
}

export interface VisitorMessageRow {
  id: number;
  session_id: number;
  role: string;
  content: string;
  sources_json: string | null;
  feedback: string;
  created_at: string;
}

export interface KnowledgeGap {
  question: string;
  count: number;
}

/**
 * 访客服务（P0 骨架）：免登录会话与助手公开信息。
 * P1 实现访客消息落库、SSE 流式问答、反馈与知识缺口记录。
 */
class VisitorService {
  getShareMeta(token: string): { share: ShareInfo; assistant: Assistant } | null {
    const share = assistantDAO.getShareByToken(token);
    if (!share || !share.enabled) return null;
    if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) return null;
    const assistant = assistantDAO.getById(share.assistant_id);
    if (!assistant || assistant.status === 'disabled') return null;
    return { share, assistant };
  }

  createSession(shareId: number, visitorLabel?: string): VisitorSession {
    const stmt = db.prepare('INSERT INTO visitor_sessions (share_id, visitor_label) VALUES (?, ?)');
    const result = stmt.run(shareId, visitorLabel ?? null);
    const session = db.prepare('SELECT * FROM visitor_sessions WHERE id = ?').get<VisitorSession>(result.lastInsertRowid as number);
    if (!session) throw new Error('创建访客会话失败');
    return session;
  }

  getSession(shareId: number, sessionId: number): VisitorSession | null {
    return db.prepare('SELECT * FROM visitor_sessions WHERE id = ? AND share_id = ?')
      .get<VisitorSession>(sessionId, shareId) ?? null;
  }

  addMessage(sessionId: number, role: 'user' | 'assistant', content: string, sourcesJson: string | null = null): void {
    db.prepare('INSERT INTO visitor_messages (session_id, role, content, sources_json) VALUES (?, ?, ?, ?)')
      .run(sessionId, role, content, sourcesJson);
  }

  getRecentMessages(sessionId: number, limit = 10): VisitorMessageRow[] {
    return db.prepare(
      'SELECT * FROM visitor_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?',
    ).all<VisitorMessageRow>(sessionId, limit).reverse();
  }

  /** 知识缺口：访客提问后助手回复没有引用任何来源（兜底回答）的问题，按次数聚合 */
  listGaps(assistantId: number, limit = 10): KnowledgeGap[] {
    return db.prepare(`
      SELECT v1.content AS question, COUNT(*) AS count
      FROM visitor_messages v1
      JOIN visitor_sessions s ON s.id = v1.session_id
      JOIN shares sh ON sh.id = s.share_id
      WHERE sh.assistant_id = ?
        AND v1.role = 'user'
        AND EXISTS (
          SELECT 1 FROM visitor_messages v2
          WHERE v2.session_id = v1.session_id
            AND v2.role = 'assistant'
            AND v2.id > v1.id
            AND (v2.sources_json IS NULL OR v2.sources_json = '[]')
        )
      GROUP BY v1.content
      ORDER BY count DESC, MAX(v1.id) DESC
      LIMIT ?
    `).all<KnowledgeGap>(assistantId, limit);
  }

  /** 全部访客提问排行（用于统计看板） */
  getTopQuestions(assistantId: number, limit = 5): KnowledgeGap[] {
    return db.prepare(`
      SELECT v1.content AS question, COUNT(*) AS count
      FROM visitor_messages v1
      JOIN visitor_sessions s ON s.id = v1.session_id
      JOIN shares sh ON sh.id = s.share_id
      WHERE sh.assistant_id = ? AND v1.role = 'user'
      GROUP BY v1.content
      ORDER BY count DESC
      LIMIT ?
    `).all<KnowledgeGap>(assistantId, limit);
  }
}

export const visitorService = new VisitorService();
