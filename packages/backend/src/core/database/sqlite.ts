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

class PreparedStatement {
  private db: SqlJsDatabase;
  private sql: string;

  constructor(db: SqlJsDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  run(...params: unknown[]): StatementResult {
    this.db.run(this.sql, params as never[]);
    return {
      changes: this.db.getRowsModified(),
      lastInsertRowid: Number(this.db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0] || 0)
    };
  }

  get<T = unknown>(...params: unknown[]): T | undefined {
    const stmt = this.db.prepare(this.sql, params as never[]);
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
    const stmt = this.db.prepare(this.sql, params as never[]);
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

  private save(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
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
