"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationDAO = exports.ConversationDAO = void 0;
const database_1 = require("../core/database");
class ConversationDAO {
    createSession(userId, title) {
        const stmt = database_1.db.prepare(`
      INSERT INTO sessions (user_id, title)
      VALUES (?, ?)
    `);
        const result = stmt.run(userId, title);
        return result.lastInsertRowid;
    }
    deleteSession(sessionId) {
        const stmt = database_1.db.prepare('DELETE FROM sessions WHERE id = ?');
        stmt.run(sessionId);
    }
    createConversation(conversationId, sessionId, workspaceId, state, parentConversationId = null, title = null) {
        const stmt = database_1.db.prepare(`
      INSERT OR IGNORE INTO conversations (
        id, session_id, workspace_id, parent_conversation_id, title, state, message_count
      ) VALUES (?, ?, ?, ?, ?, ?, 0)
    `);
        stmt.run(conversationId, sessionId, workspaceId, parentConversationId, title, state);
    }
    updateConversation(conversationId, options) {
        const updates = ['updated_at = CURRENT_TIMESTAMP'];
        const params = [];
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
        database_1.db.prepare(sql).run(...params);
    }
    getConversationById(conversationId) {
        const stmt = database_1.db.prepare(`
      SELECT id, session_id, workspace_id, parent_conversation_id, title, state, 
             created_at, updated_at, ended_at, message_count, error, position_x, position_y
      FROM conversations
      WHERE id = ?
    `);
        const row = stmt.get(conversationId);
        return row ? this.rowToConversation(row) : null;
    }
    listConversationsBySession(sessionId) {
        const stmt = database_1.db.prepare(`
      SELECT id, session_id, workspace_id, parent_conversation_id, title, state, 
             created_at, updated_at, ended_at, message_count, error, position_x, position_y
      FROM conversations
      WHERE session_id = ?
      ORDER BY created_at ASC, id ASC
    `);
        const rows = stmt.all(sessionId);
        return rows.map((row) => this.rowToConversation(row));
    }
    updateConversationPositions(sessionId, positions) {
        if (positions.length === 0)
            return;
        const conversationIds = positions.map((p) => p.conversation_id);
        const placeholders = conversationIds.map(() => '?').join(',');
        const stmt = database_1.db.prepare(`SELECT id FROM conversations WHERE session_id = ? AND id IN (${placeholders})`);
        const rows = stmt.all(sessionId, ...conversationIds);
        const foundIds = new Set(rows.map((r) => r.id));
        const missingIds = conversationIds.filter((id) => !foundIds.has(id));
        if (missingIds.length > 0) {
            throw new Error(`Conversations do not belong to session ${sessionId}: ${missingIds.join(', ')}`);
        }
        const updateStmt = database_1.db.prepare(`
      UPDATE conversations
      SET position_x = ?, position_y = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND session_id = ?
    `);
        database_1.db.transaction(() => {
            for (const item of positions) {
                updateStmt.run(item.x, item.y, item.conversation_id, sessionId);
            }
            this.updateSessionUpdatedAt(sessionId);
        });
    }
    deleteConversation(conversationId) {
        const row = database_1.db.prepare('SELECT session_id FROM conversations WHERE id = ?').get(conversationId);
        database_1.db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
        if (row) {
            this.updateSessionUpdatedAt(row.session_id);
        }
    }
    listDescendantConversationIds(conversationId) {
        const root = this.getConversationById(conversationId);
        if (!root)
            return [];
        const descendants = [];
        const queue = [conversationId];
        while (queue.length > 0) {
            const currentId = queue.shift();
            const stmt = database_1.db.prepare(`
        SELECT id
        FROM conversations
        WHERE parent_conversation_id = ?
        ORDER BY created_at ASC, id ASC
      `);
            const rows = stmt.all(currentId);
            const childIds = rows.map((r) => r.id);
            descendants.push(...childIds);
            queue.push(...childIds);
        }
        return descendants;
    }
    clearChildConversationParents(conversationId) {
        const row = database_1.db.prepare('SELECT session_id FROM conversations WHERE id = ?').get(conversationId);
        database_1.db.prepare('UPDATE conversations SET parent_conversation_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE parent_conversation_id = ?').run(conversationId);
        if (row) {
            this.updateSessionUpdatedAt(row.session_id);
        }
    }
    createMessage(messageId, conversationId, sessionId, userContent, status = 'streaming') {
        const stmt = database_1.db.prepare(`
      INSERT INTO messages (id, conversation_id, session_id, user_content, status)
      VALUES (?, ?, ?, ?, ?)
    `);
        stmt.run(messageId, conversationId, sessionId, userContent, status);
        this.updateSessionUpdatedAt(sessionId);
        this.syncConversationMessageCount(conversationId);
    }
    updateMessageAssistant(messageId, assistantContent, status = 'completed', thinkingContent = null) {
        const stmt = database_1.db.prepare(`
      UPDATE messages
      SET assistant_content = ?, thinking_content = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
        stmt.run(assistantContent, thinkingContent, status, messageId);
        const row = database_1.db.prepare('SELECT session_id, conversation_id FROM messages WHERE id = ?').get(messageId);
        if (row) {
            this.updateSessionUpdatedAt(row.session_id);
            if (row.conversation_id) {
                this.syncConversationMessageCount(row.conversation_id);
            }
        }
    }
    updateMessageStatus(messageId, status) {
        database_1.db.prepare('UPDATE messages SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, messageId);
        const row = database_1.db.prepare('SELECT session_id, conversation_id FROM messages WHERE id = ?').get(messageId);
        if (row) {
            this.updateSessionUpdatedAt(row.session_id);
        }
    }
    getMessageById(messageId) {
        const stmt = database_1.db.prepare(`
      SELECT id, conversation_id, session_id, user_content, assistant_content, thinking_content, status, created_at, updated_at
      FROM messages
      WHERE id = ?
    `);
        const row = stmt.get(messageId);
        return row ? this.rowToMessage(row) : null;
    }
    getMessagesByConversation(conversationId) {
        const stmt = database_1.db.prepare(`
      SELECT id, conversation_id, session_id, user_content, assistant_content, thinking_content, status, created_at, updated_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC, id ASC
    `);
        const rows = stmt.all(conversationId);
        return rows.map((row) => this.rowToMessage(row));
    }
    getMessagesBySession(sessionId) {
        const stmt = database_1.db.prepare(`
      SELECT id, conversation_id, session_id, user_content, assistant_content, thinking_content, status, created_at, updated_at
      FROM messages
      WHERE session_id = ?
      ORDER BY created_at ASC
    `);
        const rows = stmt.all(sessionId);
        return rows.map((row) => this.rowToMessage(row));
    }
    deleteMessagesByConversation(conversationId) {
        const row = database_1.db.prepare('SELECT session_id FROM conversations WHERE id = ?').get(conversationId);
        database_1.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
        if (row) {
            this.updateSessionUpdatedAt(row.session_id);
            this.syncConversationMessageCount(conversationId);
        }
    }
    deleteMessagesByConversations(conversationIds) {
        if (conversationIds.length === 0)
            return;
        const placeholders = conversationIds.map(() => '?').join(',');
        const sessionRow = database_1.db.prepare(`SELECT session_id FROM conversations WHERE id IN (${placeholders}) ORDER BY session_id ASC LIMIT 1`).get(...conversationIds);
        database_1.db.prepare(`DELETE FROM messages WHERE conversation_id IN (${placeholders})`).run(...conversationIds);
        if (sessionRow) {
            this.updateSessionUpdatedAt(sessionRow.session_id);
        }
        for (const conversationId of conversationIds) {
            this.syncConversationMessageCount(conversationId);
        }
    }
    deleteConversations(conversationIds) {
        if (conversationIds.length === 0)
            return;
        const placeholders = conversationIds.map(() => '?').join(',');
        const sessionRow = database_1.db.prepare(`SELECT session_id FROM conversations WHERE id IN (${placeholders}) ORDER BY session_id ASC LIMIT 1`).get(...conversationIds);
        database_1.db.prepare(`DELETE FROM conversations WHERE id IN (${placeholders})`).run(...conversationIds);
        if (sessionRow) {
            this.updateSessionUpdatedAt(sessionRow.session_id);
        }
    }
    getSessionById(sessionId) {
        const stmt = database_1.db.prepare(`
      SELECT id, user_id, title, created_at, updated_at
      FROM sessions
      WHERE id = ?
    `);
        const row = stmt.get(sessionId);
        return row ? this.rowToSession(row) : null;
    }
    getParentChainConversationIds(conversationId) {
        const chain = [];
        let currentId = conversationId;
        const visited = new Set();
        while (currentId && !visited.has(currentId)) {
            visited.add(currentId);
            chain.push(currentId);
            const conv = this.getConversationById(currentId);
            if (!conv)
                break;
            currentId = conv.parent_conversation_id;
        }
        return chain;
    }
    getParentChainMessages(conversationId) {
        const chainIds = this.getParentChainConversationIds(conversationId);
        if (chainIds.length === 0)
            return [];
        const allMessages = [];
        for (const convId of chainIds) {
            const messages = this.getMessagesByConversation(convId);
            allMessages.push(...messages);
        }
        allMessages.sort((a, b) => a.created_at.localeCompare(b.created_at));
        return allMessages;
    }
    syncConversationMessageCount(conversationId) {
        database_1.db.prepare(`
      UPDATE conversations
      SET message_count = (
        SELECT COUNT(*) FROM messages WHERE conversation_id = ?
      ), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(conversationId, conversationId);
    }
    updateSessionUpdatedAt(sessionId) {
        database_1.db.prepare('UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
    }
    rowToSession(row) {
        return {
            id: row.id,
            user_id: row.user_id,
            title: row.title,
            created_at: row.created_at,
            updated_at: row.updated_at,
        };
    }
    rowToConversation(row) {
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
    rowToMessage(row) {
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
exports.ConversationDAO = ConversationDAO;
exports.conversationDAO = new ConversationDAO();
//# sourceMappingURL=conversation-dao.js.map