import { db, SessionRow, ConversationRow, MessageRow } from '../core/database';

export interface Session {
  id: number;
  user_id: number | null;
  title: string;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  session_id: number;
  workspace_id: string | null;
  parent_conversation_id: string | null;
  title: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  message_count: number;
  error: string | null;
  position_x: number | null;
  position_y: number | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  session_id: number;
  user_content: string;
  assistant_content: string | null;
  thinking_content: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export class ConversationDAO {
  createSession(userId: number, title: string, workspaceId: string): number {
    const stmt = db.prepare(`
      INSERT INTO sessions (user_id, title, workspace_id)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(userId, title, workspaceId);
    return result.lastInsertRowid as number;
  }

  deleteSession(sessionId: number): void {
    const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(sessionId);
  }

  createConversation(
    conversationId: string,
    sessionId: number,
    workspaceId: string | null,
    state: string,
    parentConversationId: string | null = null,
    title: string | null = null
  ): void {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO conversations (
        id, session_id, workspace_id, parent_conversation_id, title, state, message_count
      ) VALUES (?, ?, ?, ?, ?, ?, 0)
    `);
    stmt.run(conversationId, sessionId, workspaceId, parentConversationId, title, state);
  }

  updateConversation(
    conversationId: string,
    options: {
      workspace_id?: string | null;
      parent_conversation_id?: string | null;
      title?: string | null;
      state?: string | null;
      message_count?: number;
      error?: string | null;
      ended_at?: string | null;
      position_x?: number | null;
      position_y?: number | null;
    }
  ): void {
    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: (string | number | null)[] = [];

    if (options.workspace_id !== undefined) {
      updates.push('workspace_id = ?');
      params.push(options.workspace_id);
    }
    if (options.parent_conversation_id !== undefined) {
      updates.push('parent_conversation_id = ?');
      params.push(options.parent_conversation_id);
    }
    if (options.title !== undefined) {
      updates.push('title = ?');
      params.push(options.title);
    }
    if (options.state !== undefined) {
      updates.push('state = ?');
      params.push(options.state);
    }
    if (options.message_count !== undefined) {
      updates.push('message_count = ?');
      params.push(options.message_count);
    }
    if (options.error !== undefined) {
      updates.push('error = ?');
      params.push(options.error);
    }
    if (options.ended_at !== undefined) {
      updates.push('ended_at = ?');
      params.push(options.ended_at);
    }
    if (options.position_x !== undefined) {
      updates.push('position_x = ?');
      params.push(options.position_x);
    }
    if (options.position_y !== undefined) {
      updates.push('position_y = ?');
      params.push(options.position_y);
    }

    params.push(conversationId);
    const sql = `UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(sql).run(...params);
  }

  getConversationById(conversationId: string): Conversation | null {
    const stmt = db.prepare(`
      SELECT id, session_id, workspace_id, parent_conversation_id, title, state, 
             created_at, updated_at, ended_at, message_count, error, position_x, position_y
      FROM conversations
      WHERE id = ?
    `);
    const row = stmt.get(conversationId) as ConversationRow | undefined;
    return row ? this.rowToConversation(row) : null;
  }

  listConversationsBySession(sessionId: number): Conversation[] {
    const stmt = db.prepare(`
      SELECT id, session_id, workspace_id, parent_conversation_id, title, state, 
             created_at, updated_at, ended_at, message_count, error, position_x, position_y
      FROM conversations
      WHERE session_id = ?
      ORDER BY created_at ASC, id ASC
    `);
    const rows = stmt.all(sessionId) as ConversationRow[];
    return rows.map((row) => this.rowToConversation(row));
  }

  updateConversationPositions(sessionId: number, positions: Array<{ conversation_id: string; x: number; y: number }>): void {
    if (positions.length === 0) return;

    const conversationIds = positions.map((p) => p.conversation_id);
    const placeholders = conversationIds.map(() => '?').join(',');
    const stmt = db.prepare(`SELECT id FROM conversations WHERE session_id = ? AND id IN (${placeholders})`);
    const rows = stmt.all(sessionId, ...conversationIds) as Array<{ id: string }>;
    const foundIds = new Set(rows.map((r) => r.id));
    const missingIds = conversationIds.filter((id) => !foundIds.has(id));

    if (missingIds.length > 0) {
      throw new Error(`Conversations do not belong to session ${sessionId}: ${missingIds.join(', ')}`);
    }

    const updateStmt = db.prepare(`
      UPDATE conversations
      SET position_x = ?, position_y = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND session_id = ?
    `);

    db.transaction(() => {
      for (const item of positions) {
        updateStmt.run(item.x, item.y, item.conversation_id, sessionId);
      }
      this.updateSessionUpdatedAt(sessionId);
    });
  }

  deleteConversation(conversationId: string): void {
    const row = db.prepare('SELECT session_id FROM conversations WHERE id = ?').get(conversationId) as { session_id: number } | undefined;
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);

    if (row) {
      this.updateSessionUpdatedAt(row.session_id);
    }
  }

  listDescendantConversationIds(conversationId: string): string[] {
    const root = this.getConversationById(conversationId);
    if (!root) return [];

    const descendants: string[] = [];
    const queue: string[] = [conversationId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const stmt = db.prepare(`
        SELECT id
        FROM conversations
        WHERE parent_conversation_id = ?
        ORDER BY created_at ASC, id ASC
      `);
      const rows = stmt.all(currentId) as Array<{ id: string }>;
      const childIds = rows.map((r) => r.id);
      descendants.push(...childIds);
      queue.push(...childIds);
    }

    return descendants;
  }

  clearChildConversationParents(conversationId: string): void {
    const row = db.prepare('SELECT session_id FROM conversations WHERE id = ?').get(conversationId) as { session_id: number } | undefined;
    db.prepare('UPDATE conversations SET parent_conversation_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE parent_conversation_id = ?').run(conversationId);

    if (row) {
      this.updateSessionUpdatedAt(row.session_id);
    }
  }

  createMessage(
    messageId: string,
    conversationId: string,
    sessionId: number,
    userContent: string,
    status: string = 'streaming'
  ): void {
    const stmt = db.prepare(`
      INSERT INTO messages (id, conversation_id, session_id, user_content, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(messageId, conversationId, sessionId, userContent, status);
    this.updateSessionUpdatedAt(sessionId);
    this.syncConversationMessageCount(conversationId);
  }

  updateMessageAssistant(
    messageId: string,
    assistantContent: string,
    status: string = 'completed',
    thinkingContent: string | null = null
  ): void {
    const stmt = db.prepare(`
      UPDATE messages
      SET assistant_content = ?, thinking_content = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(assistantContent, thinkingContent, status, messageId);

    const row = db.prepare('SELECT session_id, conversation_id FROM messages WHERE id = ?').get(messageId) as { session_id: number; conversation_id: string } | undefined;
    if (row) {
      this.updateSessionUpdatedAt(row.session_id);
      if (row.conversation_id) {
        this.syncConversationMessageCount(row.conversation_id);
      }
    }
  }

  updateMessageStatus(messageId: string, status: string): void {
    db.prepare('UPDATE messages SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, messageId);

    const row = db.prepare('SELECT session_id, conversation_id FROM messages WHERE id = ?').get(messageId) as { session_id: number } | undefined;
    if (row) {
      this.updateSessionUpdatedAt(row.session_id);
    }
  }

  getMessageById(messageId: string): Message | null {
    const stmt = db.prepare(`
      SELECT id, conversation_id, session_id, user_content, assistant_content, thinking_content, status, created_at, updated_at
      FROM messages
      WHERE id = ?
    `);
    const row = stmt.get(messageId) as MessageRow | undefined;
    return row ? this.rowToMessage(row) : null;
  }

  getMessagesByConversation(conversationId: string): Message[] {
    const stmt = db.prepare(`
      SELECT id, conversation_id, session_id, user_content, assistant_content, thinking_content, status, created_at, updated_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, id ASC
    `);
    const rows = stmt.all(conversationId) as MessageRow[];
    return rows.map((row) => this.rowToMessage(row));
  }

  getMessagesBySession(sessionId: number): Message[] {
    const stmt = db.prepare(`
      SELECT id, conversation_id, session_id, user_content, assistant_content, thinking_content, status, created_at, updated_at
      FROM messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(sessionId) as MessageRow[];
    return rows.map((row) => this.rowToMessage(row));
  }

  deleteMessagesByConversation(conversationId: string): void {
    const row = db.prepare('SELECT session_id FROM conversations WHERE id = ?').get(conversationId) as { session_id: number } | undefined;
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);

    if (row) {
      this.updateSessionUpdatedAt(row.session_id);
      this.syncConversationMessageCount(conversationId);
    }
  }

  deleteMessagesByConversations(conversationIds: string[]): void {
    if (conversationIds.length === 0) return;

    const placeholders = conversationIds.map(() => '?').join(',');
    const sessionRow = db.prepare(`SELECT session_id FROM conversations WHERE id IN (${placeholders}) ORDER BY session_id ASC LIMIT 1`).get(...conversationIds) as { session_id: number } | undefined;
    db.prepare(`DELETE FROM messages WHERE conversation_id IN (${placeholders})`).run(...conversationIds);

    if (sessionRow) {
      this.updateSessionUpdatedAt(sessionRow.session_id);
    }
    for (const conversationId of conversationIds) {
      this.syncConversationMessageCount(conversationId);
    }
  }

  deleteConversations(conversationIds: string[]): void {
    if (conversationIds.length === 0) return;

    const placeholders = conversationIds.map(() => '?').join(',');
    const sessionRow = db.prepare(`SELECT session_id FROM conversations WHERE id IN (${placeholders}) ORDER BY session_id ASC LIMIT 1`).get(...conversationIds) as { session_id: number } | undefined;
    db.prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`).run(...conversationIds);

    if (sessionRow) {
      this.updateSessionUpdatedAt(sessionRow.session_id);
    }
  }

  getSessionById(sessionId: number): Session | null {
    const stmt = db.prepare(`
      SELECT id, user_id, title, workspace_id, created_at, updated_at
      FROM sessions
      WHERE id = ?
    `);
    const row = stmt.get(sessionId) as SessionRow | undefined;
    return row ? this.rowToSession(row) : null;
  }

  getParentChainConversationIds(conversationId: string): string[] {
    const chain: string[] = [];
    let currentId: string | null = conversationId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      chain.push(currentId);
      const conv = this.getConversationById(currentId);
      if (!conv) break;
      currentId = conv.parent_conversation_id;
    }

    return chain;
  }

  getParentChainMessages(conversationId: string): Message[] {
    const chainIds = this.getParentChainConversationIds(conversationId);
    if (chainIds.length === 0) return [];

    const allMessages: Message[] = [];
    for (const convId of chainIds) {
      const messages = this.getMessagesByConversation(convId);
      allMessages.push(...messages);
    }

    allMessages.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return allMessages;
  }

  private syncConversationMessageCount(conversationId: string): void {
    db.prepare(`
      UPDATE conversations
      SET message_count = (
        SELECT COUNT(*) FROM messages WHERE conversation_id = ?
      ), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(conversationId, conversationId);
  }

  private updateSessionUpdatedAt(sessionId: number): void {
    db.prepare('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
  }

  private rowToSession(row: SessionRow): Session {
    return {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      workspace_id: row.workspace_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private rowToConversation(row: ConversationRow): Conversation {
    return {
      id: row.id,
      session_id: row.session_id,
      workspace_id: row.workspace_id,
      parent_conversation_id: row.parent_conversation_id,
      title: row.title,
      state: row.state,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ended_at: row.ended_at,
      message_count: row.message_count,
      error: row.error,
      position_x: row.position_x,
      position_y: row.position_y,
    };
  }

  private rowToMessage(row: MessageRow): Message {
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      session_id: row.session_id,
      user_content: row.user_content,
      assistant_content: row.assistant_content,
      thinking_content: row.thinking_content,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

export const conversationDAO = new ConversationDAO();
