import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../logging';
import { appConfig } from '../config';

export interface SessionRow {
  id: number;
  user_id: number | null;
  title: string;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationRow {
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

export interface MessageRow {
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

export interface UserRow {
  id: number;
  name: string | null;
}

interface StatementResult {
  changes: number;
  lastInsertRowid: number;
}

/**
 * L2 防御：sql.js 无法绑定 JavaScript undefined，统一转 null 并告警。
 * 当检测到 undefined 参数时输出 warning 日志，帮助开发者定位上游 bug。
 * DAO 层（L1）应优先使用 ?? 运算符在源头消除 undefined。
 */
function sanitizeParams(params: unknown[], sql: string): unknown[] {
  const safeParams = params.map(p => p === undefined ? null : p);
  const hasUndefined = params.some(p => p === undefined);
  if (hasUndefined) {
    const undefinedIndices = params.reduce<number[]>((acc, p, i) => {
      if (p === undefined) acc.push(i);
      return acc;
    }, []);
    console.warn(
      `[DB-PARAM] undefined detected at indices [${undefinedIndices.join(', ')}] ` +
      `in SQL: ${sql.substring(0, 80)}... ` +
      `Use ?? operator in DAO layer to fix the source.`
    );
  }
  return safeParams;
}

class PreparedStatement {
  private db: SqlJsDatabase;
  private sql: string;

  constructor(db: SqlJsDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  run(...params: unknown[]): StatementResult {
    const safeParams = sanitizeParams(params, this.sql);
    this.db.run(this.sql, safeParams as never[]);
    return {
      changes: this.db.getRowsModified(),
      lastInsertRowid: Number(this.db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0] || 0)
    };
  }

  get<T = unknown>(...params: unknown[]): T | undefined {
    const safeParams = sanitizeParams(params, this.sql);
    const stmt = this.db.prepare(this.sql, safeParams as never[]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as T;
      stmt.free();
      return row;
    }
    stmt.free();
    return undefined;
  }

  all<T = unknown>(...params: unknown[]): T[] {
    const results: T[] = [];
    const safeParams = sanitizeParams(params, this.sql);
    const stmt = this.db.prepare(this.sql, safeParams as never[]);
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }
}

export class SQLiteDatabase {
  private db: SqlJsDatabase | null = null;
  private SQL: SqlJsStatic | null = null;
  private dbPath: string;
  private static instance: SQLiteDatabase | null = null;
  private initialized = false;
  private autoSaveTimer: NodeJS.Timeout | null = null;

  private constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  static async getInstance(): Promise<SQLiteDatabase> {
    if (!SQLiteDatabase.instance) {
      SQLiteDatabase.instance = new SQLiteDatabase(appConfig.database.path);
      await SQLiteDatabase.instance.init();
    }
    return SQLiteDatabase.instance;
  }

  static getInstanceSync(): SQLiteDatabase {
    if (!SQLiteDatabase.instance) {
      SQLiteDatabase.instance = new SQLiteDatabase(appConfig.database.path);
      SQLiteDatabase.instance.initInBackground();
    }
    return SQLiteDatabase.instance;
  }

  private async init(): Promise<void> {
    if (this.initialized) return;

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const cwd = process.cwd();
    const isAndroid = cwd === '/' || cwd === '/system';
    const filesDir = process.env.FILES_DIR || '/data/data/com.workbranch.app/files';

    this.SQL = await initSqlJs({
      locateFile: (file: string) => {
        if (isAndroid) {
          const androidPath = path.join(filesDir, 'www', 'nodejs-project', file);
          if (fs.existsSync(androidPath)) {
            return androidPath;
          }
        }
        const devPath = path.join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', file);
        if (fs.existsSync(devPath)) {
          return devPath;
        }
        const bundlePath = path.join(__dirname, file);
        if (fs.existsSync(bundlePath)) {
          return bundlePath;
        }
        const androidPath = path.join(__dirname, '..', '..', 'sql-wasm.wasm');
        if (fs.existsSync(androidPath)) {
          return androidPath;
        }
        return file;
      }
    });

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }

    this.initialize();
    this.initialized = true;
    this.startAutoSave();
  }

  private initInBackground(): void {
    this.init().catch(err => {
      logger.error('Failed to initialize database:', err);
    });
  }

  private initialize(): void {
    if (!this.db) return;

    const createTables = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        title TEXT,
        workspace_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        session_id INTEGER NOT NULL,
        workspace_id TEXT,
        parent_conversation_id TEXT,
        title TEXT,
        state TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        message_count INTEGER DEFAULT 0,
        error TEXT,
        position_x REAL,
        position_y REAL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(parent_conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        session_id INTEGER NOT NULL,
        user_content TEXT NOT NULL,
        assistant_content TEXT,
        thinking_content TEXT,
        status TEXT DEFAULT 'streaming',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_parent_conversation_id ON conversations(parent_conversation_id);
    `;

    this.db.run(createTables);
    this.save();
    logger.info('Database tables created');

    this.migrateAddWorkspaceId();

    this.db.run('INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)', [1, 'Default User']);
    this.save();
  }

  private migrateAddWorkspaceId(): void {
    if (!this.db) return;

    const result = this.db.exec("PRAGMA table_info(sessions)");
    const columns = result[0]?.values.map((v: unknown[]) => v[1] as string) || [];
    const hasWorkspaceId = columns.includes('workspace_id');

    if (!hasWorkspaceId) {
      this.db.run('ALTER TABLE sessions ADD COLUMN workspace_id TEXT');
      this.db.run('DELETE FROM messages');
      this.db.run('DELETE FROM conversations');
      this.db.run('DELETE FROM sessions');
      this.save();
      logger.info('Migrated sessions table: added workspace_id column, cleared existing data');
    }
  }

  private startAutoSave(): void {
    if (this.autoSaveTimer) return;
    this.autoSaveTimer = setInterval(() => {
      if (this.db && this.initialized) {
        this.save();
      }
    }, 5000);
  }

  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /** Flush in-memory sql.js DB to disk. Call after writes outside transaction(). */
  save(): void {
    const fs_mod = require('fs');
    console.log(`[DB-SAVE] save() called dbPath=${this.dbPath} hasDb=${!!this.db}`);
    if (!this.db) { console.log('[DB-SAVE] ABORT: no db'); return; }
    try {
      // CRITICAL: Force sql.js to consolidate all in-memory changes before export
      try { this.db.run('VACUUM'); } catch(vacErr) {
        console.log(`[DB-SAVE] VACUUM skipped: ${vacErr.message}`);
      }

      const data = this.db.export();
      const buffer = Buffer.from(data);
      const beforeSize = fs_mod.existsSync(this.dbPath) ? fs_mod.statSync(this.dbPath).size : 0;
      fs_mod.writeFileSync(this.dbPath, buffer);
      // Force flush to physical storage to survive process kill on Android
      try {
        const fd = fs_mod.openSync(this.dbPath, 'r+');
        fs_mod.fsyncSync(fd);
        fs_mod.closeSync(fd);
      } catch (syncErr) {
        console.log(`[DB-SAVE] fsync skipped: ${syncErr.message}`);
      }
      const afterSize = fs_mod.statSync(this.dbPath).size;
      console.log(`[DB-SAVE] WRITTEN ${buffer.length} bytes to ${this.dbPath} size: ${beforeSize} -> ${afterSize}`);

      // Verify: read back and check conversations count
      try {
        const raw = fs_mod.readFileSync(this.dbPath);
        console.log(`[DB-SAVE] VERIFY: file read back ${raw.length} bytes, matches buffer: ${raw.length === buffer.length}`);
        // Try to detect if it's a valid SQLite header
        const header = raw.slice(0, 16).toString('hex');
        console.log(`[DB-SAVE] VERIFY: file header=${header}`);

        // Also log sql.js in-memory state for comparison
        try {
          const convC = this.db.prepare('SELECT COUNT(*) as c FROM conversations').get() as any;
          const msgC = this.db.prepare('SELECT COUNT(*) as c FROM messages').get() as any;
          console.log(`[DB-SAVE] VERIFY: mem-state convs=${convC?.c} msgs=${msgC?.c}`);
        } catch(e2) { /* ignore */ }
      } catch(vErr) {
        console.error(`[DB-SAVE] VERIFY error: ${vErr.message}`);
      }
    } catch(e) { console.error(`[DB-SAVE] ERROR: ${e.message}`); }
  }

  prepare(sql: string): PreparedStatement {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return new PreparedStatement(this.db, sql);
  }

  transaction<T>(fn: () => T): T {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    this.db.run('BEGIN TRANSACTION');
    try {
      const result = fn();
      this.db.run('COMMIT');
      this.save();
      return result;
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
  }

  exec(sql: string): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    this.db.run(sql);
    this.save();
  }

  close(): void {
    this.stopAutoSave();
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }

  isReady(): boolean {
    return this.initialized && this.db !== null;
  }
}

export const dbPromise = SQLiteDatabase.getInstance();
export const db = SQLiteDatabase.getInstanceSync();
