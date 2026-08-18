import { db, UserRow, SessionRow } from '../core/database';
import type { Session } from './conversation-dao';

export interface User {
  id: number;
  name: string | null;
}

export class UserDAO {
  createUser(name: string): number {
    const stmt = db.prepare('INSERT INTO users (name) VALUES (?)');
    const result = stmt.run(name);
    return result.lastInsertRowid as number;
  }

  getUserById(userId: number): User | null {
    const stmt = db.prepare('SELECT id, name FROM users WHERE id = ?');
    const row = stmt.get(userId) as UserRow | undefined;
    return row ? { id: row.id, name: row.name } : null;
  }

  listSessions(userId: number): Session[] {
    const stmt = db.prepare(`
      SELECT id, user_id, title, workspace_id, workspace_status, created_at, updated_at
      FROM sessions
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `);
    const rows = stmt.all(userId) as SessionRow[];
    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      workspace_id: row.workspace_id,
      workspace_status: row.workspace_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  deleteUser(userId: number): void {
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  }

  updateUserName(userId: number, newName: string): void {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(newName, userId);
  }

  getOrCreateDefaultUser(): User {
    const stmt = db.prepare('SELECT id, name FROM users LIMIT 1');
    const row = stmt.get() as UserRow | undefined;
    if (row) {
      return { id: row.id, name: row.name };
    }
    const userId = this.createUser('Local User');
    return { id: userId, name: 'Local User' };
  }
}

export const userDAO = new UserDAO();
