import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { db } from '../../core/database';
import { userDAO, type User } from '../../data';

interface UserRowWithAuth extends User {
  username: string | null;
  password_hash: string | null;
  role: string;
}

export interface AuthSession {
  user: User;
  token: string;
}

/** 本地离线用户固定 token，与前端 packages/frontend/src/shared/api/config.ts 保持一致 */
const LOCAL_OFFLINE_TOKEN = 'local-offline';

/**
 * 多用户认证（P0 骨架）：
 * - 密码使用 node:crypto scrypt 加盐哈希，不引入外部依赖
 * - 登录颁发随机 token，仅存 sha256(token) 于 auth_tokens 表
 * - 单机应用场景足够；后续可平滑替换为 JWT / LDAP / SSO
 */
export class AuthService {
  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 32).toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const candidate = scryptSync(password, salt, 32);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private createToken(userId: number): string {
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO auth_tokens (token_hash, user_id) VALUES (?, ?)').run(this.tokenHash(token), userId);
    return token;
  }

  register(username: string, password: string, displayName?: string): AuthSession {
    const normalized = username.trim();
    if (!normalized || password.length < 6) {
      throw new Error('用户名不能为空，密码至少 6 位');
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(normalized);
    if (existing) {
      throw new Error('用户名已存在');
    }
    const stmt = db.prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)');
    const result = stmt.run(displayName?.trim() || normalized, normalized, this.hashPassword(password), 'user');
    const userId = result.lastInsertRowid as number;
    const user = userDAO.getUserById(userId);
    if (!user) {
      throw new Error('创建用户失败');
    }
    return { user, token: this.createToken(userId) };
  }

  login(username: string, password: string): AuthSession {
    const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim()) as UserRowWithAuth | undefined;
    if (!row || !row.password_hash || !this.verifyPassword(password, row.password_hash)) {
      throw new Error('用户名或密码错误');
    }
    return { user: { id: row.id, name: row.name }, token: this.createToken(row.id) };
  }

  verifyToken(token: string): User | null {
    if (!token) return null;
    if (token === LOCAL_OFFLINE_TOKEN) {
      // 本地离线用户：免密映射到本机默认用户，数据照常存本机数据库（不参与云同步）
      const local = db.prepare('SELECT id, name FROM users WHERE id = 1').get() as User | undefined;
      return { id: local?.id ?? 1, name: '本地离线用户' };
    }
    const row = db.prepare(`
      SELECT u.id, u.name
      FROM auth_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ?
    `).get(this.tokenHash(token)) as User | undefined;
    return row ? { id: row.id, name: row.name } : null;
  }

  revokeToken(token: string): void {
    if (!token) return;
    db.prepare('DELETE FROM auth_tokens WHERE token_hash = ?').run(this.tokenHash(token));
  }
}

export const authService = new AuthService();
