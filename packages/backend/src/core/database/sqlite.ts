import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
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
  content_blocks: string | null;
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
 * 写透代理：包装 sql.js，实现类似 better-sqlite3 的即时持久化能力。
 *
 * 核心机制：
 * - 每次写操作（run/exec）后自动触发 save() + fsync()
 * - 50ms 防抖：短时间内多次写入只保存一次
 * - 强制同步点：事务提交、close() 时立即 fsync
 */
class PersistentDatabase {
  private _db: SqlJsDatabase;
  private dbPath: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private fd: number | null = null;
  private closed = false;

  constructor(db: SqlJsDatabase, dbPath: string) {
    this._db = db;
    this.dbPath = dbPath;
    // 保持文件描述符打开用于 fsync
    try {
      if (fs.existsSync(dbPath)) {
        this.fd = fs.openSync(dbPath, 'r+');
      } else {
        this.fd = fs.openSync(dbPath, 'w');
      }
    } catch {
      logger.warn(`Cannot open fd for fsync: ${dbPath}`);
    }
  }

  exec(sql: string): void {
    this.ensureOpen();
    this._db.exec(sql);
    if (this.isWriteOperation(sql)) {
      this.scheduleSave();
    }
  }

  run(sql: string, params?: unknown[]): StatementResult {
    this.ensureOpen();
    const result = this._db.run(sql, params);
    this.scheduleSave();
    return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
  }

  pragma(cmd: string): unknown[] {
    this.ensureOpen();
    const results = this._db.exec(`PRAGMA ${cmd}`);
    if (results.length === 0) return [];
    return results[0].values || [];
  }

  prepare(sql: string): PreparedStatementProxy {
    this.ensureOpen();
    return new PreparedStatementProxy(this, sql);
  }

  transaction<T>(fn: () => T): T {
    this.ensureOpen();
    this.exec('BEGIN');
    try {
      const result = fn();
      this.exec('COMMIT');
      this.forceSave(); // 事务提交是强同步点
      return result;
    } catch (e) {
      this.exec('ROLLBACK');
      throw e;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.forceSave(); // 关闭前强制保存
    if (this.fd !== null) {
      try { fs.closeSync(this.fd); } catch { /* ignore */ }
      this.fd = null;
    }
    this._db.close();
  }

  scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.forceSave(); }, 50);
  }

  forceSave(): void {
    if (!this.dirty || this.closed) return;
    try {
      const data = this._db.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
      if (this.fd !== null) fs.fsyncSync(this.fd);
    } catch (e) {
      logger.error(`PersistentDatabase forceSave failed: ${e}`);
    }
    this.dirty = false;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('Database is closed');
  }

  private isWriteOperation(sql: string): boolean {
    const trimmed = sql.trim().toUpperCase();
    return /^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE|TRUNCATE)\b/.test(trimmed);
  }

  /** @internal 供 PreparedStatementProxy 使用 */
  get rawDb(): SqlJsDatabase { return this._db; }
}

class PreparedStatementProxy {
  private owner: PersistentDatabase;
  private sql: string;

  constructor(owner: PersistentDatabase, sql: string) {
    this.owner = owner;
    this.sql = sql;
  }

  run(...params: unknown[]): StatementResult {
    return this.owner.run(this.sql, params);
  }

  get<T = unknown>(...params: unknown[]): T | undefined {
    const stmt = this.owner.rawDb.prepare(this.sql);
    if (params?.length) stmt.bind(params);
    if (stmt.step()) { const row = stmt.getAsObject() as T; stmt.free(); return row; }
    stmt.free();
    return undefined;
  }

  all<T = unknown>(...params: unknown[]): T[] {
    const results: T[] = [];
    const stmt = this.owner.rawDb.prepare(this.sql);
    if (params?.length) stmt.bind(params);
    while (stmt.step()) results.push(stmt.getAsObject() as T);
    stmt.free();
    return results;
  }

  get source(): string { return this.sql; }
}

/**
 * L2 防御：统一转 undefined 为 null 并告警。
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
  private stmt: PreparedStatementProxy;

  constructor(stmt: PreparedStatementProxy) {
    this.stmt = stmt;
  }

  run(...params: unknown[]): StatementResult {
    const safeParams = sanitizeParams(params, this.stmt.source);
    return this.stmt.run(...safeParams);
  }

  get<T = unknown>(...params: unknown[]): T | undefined {
    const safeParams = sanitizeParams(params, this.stmt.source);
    return this.stmt.get<T>(...(safeParams as never[]));
  }

  all<T = unknown>(...params: unknown[]): T[] {
    const safeParams = sanitizeParams(params, this.stmt.source);
    return this.stmt.all<T>(...(safeParams as never[]));
  }
}

export class SQLiteDatabase {
  private db: PersistentDatabase | null = null;
  private dbPath: string;
  private static instance: SQLiteDatabase | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

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
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    await this.initPromise;
  }

  private async doInit(): Promise<void> {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 初始化 sql.js WASM 引擎
    const SQL = await initSqlJs();

    // 尝试从文件加载已有数据库
    let db: SqlJsDatabase;
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    // 包装为写透代理
    this.db = new PersistentDatabase(db, this.dbPath);

    // 配置持久化（sql.js 内存中模拟 WAL）
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');

    this.initialize();
    this.initialized = true;

    logger.info(`Database opened at ${this.dbPath} (sql.js + write-through proxy, sync=FULL)`);
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
        content_blocks TEXT,
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

    this.db.exec(createTables);
    logger.info('Database tables created');

    this.migrateAddWorkspaceId();
    this.migrateAddMessageContentBlocks();

    this.db.prepare('INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)').run(1, 'Default User');
  }

  private migrateAddWorkspaceId(): void {
    if (!this.db) return;

    try {
      const columns = this.db.pragma('table_info(sessions)');
      const hasWorkspaceId = this.hasTableColumn(columns, 'workspace_id');

      if (!hasWorkspaceId) {
        this.db.exec('ALTER TABLE sessions ADD COLUMN workspace_id TEXT');
        this.db.exec('DELETE FROM messages');
        this.db.exec('DELETE FROM conversations');
        this.db.exec('DELETE FROM sessions');
        logger.info('Migrated sessions table: added workspace_id column, cleared existing data');
      }
    } catch (e) {
      // 列已存在时 sql.js 会抛错，忽略即可（幂等迁移）
      logger.warn(`migrateAddWorkspaceId skipped: ${e instanceof Error ? e.message : e}`);
    }
  }

  private migrateAddMessageContentBlocks(): void {
    if (!this.db) return;

    try {
      const columns = this.db.pragma('table_info(messages)');
      if (!this.hasTableColumn(columns, 'content_blocks')) {
        this.db.exec('ALTER TABLE messages ADD COLUMN content_blocks TEXT');
        logger.info('Migrated messages table: added content_blocks column');
      }
    } catch (e) {
      logger.warn(`migrateAddMessageContentBlocks failed: ${e instanceof Error ? e.message : e}`);
      throw e;
    }
  }

  private hasTableColumn(columns: unknown[], columnName: string): boolean {
    return columns.some((column) => {
      if (Array.isArray(column)) return column[1] === columnName;
      return typeof column === 'object' && column !== null &&
        (column as Record<string, unknown>).name === columnName;
    });
  }

  prepare(sql: string): PreparedStatement {
    if (!this.db) throw new Error('Database not initialized');
    return new PreparedStatement(this.db.prepare(sql));
  }

  transaction<T>(fn: () => T): T {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.transaction(fn);
  }

  exec(sql: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.exec(sql);
  }

  close(): void {
    if (this.db) {
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
