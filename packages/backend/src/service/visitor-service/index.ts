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

/**
 * 访客服务（P0 骨架）：免登录会话与助手公开信息。
 * P1 实现访客消息落库、SSE 流式问答、反馈与知识缺口记录。
 */
class VisitorService {
  getShareMeta(token: string): { share: ShareInfo; assistant: Assistant } | null {
    const share = assistantDAO.getShareByToken(token);
    if (!share || !share.enabled) return null;
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
}

export const visitorService = new VisitorService();
