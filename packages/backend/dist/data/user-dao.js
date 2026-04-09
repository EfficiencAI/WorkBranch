"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userDAO = exports.UserDAO = void 0;
const database_1 = require("../core/database");
class UserDAO {
    createUser(name) {
        const stmt = database_1.db.prepare('INSERT INTO users (name) VALUES (?)');
        const result = stmt.run(name);
        return result.lastInsertRowid;
    }
    getUserById(userId) {
        const stmt = database_1.db.prepare('SELECT id, name FROM users WHERE id = ?');
        const row = stmt.get(userId);
        return row ? { id: row.id, name: row.name } : null;
    }
    listSessions(userId) {
        const stmt = database_1.db.prepare(`
      SELECT id, user_id, title, created_at, updated_at
      FROM sessions
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `);
        const rows = stmt.all(userId);
        return rows.map((row) => ({
            id: row.id,
            user_id: row.user_id,
            title: row.title,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }));
    }
    deleteUser(userId) {
        database_1.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    }
    updateUserName(userId, newName) {
        database_1.db.prepare('UPDATE users SET name = ? WHERE id = ?').run(newName, userId);
    }
    getOrCreateDefaultUser() {
        const stmt = database_1.db.prepare('SELECT id, name FROM users LIMIT 1');
        const row = stmt.get();
        if (row) {
            return { id: row.id, name: row.name };
        }
        const userId = this.createUser('Local User');
        return { id: userId, name: 'Local User' };
    }
}
exports.UserDAO = UserDAO;
exports.userDAO = new UserDAO();
//# sourceMappingURL=user-dao.js.map