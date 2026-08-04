import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';

export interface CacheEntry {
  cache_key: string;
  original_hash: string;
  compressed_result: string;
  target_ratio: number;
  original_tokens: number;
  compressed_tokens: number;
  created_at: string;
  expires_at: string;
  access_count: number;
}

/**
 * 写透代理：sql.js + 自动持久化（与 sqlite.ts 中的 PersistentDatabase 同构）
 */
class CachePersistentDatabase {
  private _db: SqlJsDatabase;
  private dbPath: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private fd: number | null = null;
  private closed = false;

  constructor(db: SqlJsDatabase, dbPath: string) {
    this._db = db;
    this.dbPath = dbPath;
    try {
      if (fs.existsSync(dbPath)) { this.fd = fs.openSync(dbPath, 'r+'); }
      else { this.fd = fs.openSync(dbPath, 'w'); }
    } catch { /* ignore */ }
  }

  exec(sql: string): void {
    if (this.closed) throw new Error('Database is closed');
    this._db.exec(sql);
    if (/^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE|TRUNCATE)\b/i.test(sql.trim())) this.scheduleSave();
  }

  run(sql: string, params?: unknown[]): void {
    if (this.closed) throw new Error('Database is closed');
    this._db.run(sql, params);
    this.scheduleSave();
  }

  prepare(sql: string): CacheStatementProxy {
    if (this.closed) throw new Error('Database is closed');
    return new CacheStatementProxy(this, sql);
  }

  pragma(cmd: string): unknown[] {
    if (this.closed) throw new Error('Database is closed');
    const results = this._db.exec(`PRAGMA ${cmd}`);
    return results.length > 0 ? results[0].values : [];
  }

  close(): void {
    if (this.closed) return;
    this.closed = true; this.forceSave();
    if (this.fd !== null) { try { fs.closeSync(this.fd); } catch {} this.fd = null; }
    this._db.close();
  }

  private scheduleSave(): void { this.dirty = true; if (!this.saveTimer) this.saveTimer = setTimeout(() => this.forceSave(), 50); }
  forceSave(): void {
    if (!this.dirty || this.closed) return;
    try { fs.writeFileSync(this.dbPath, Buffer.from(this._db.export())); if (this.fd !== null) fs.fsyncSync(this.fd); } catch {}
    this.dirty = false;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
  }
  get rawDb(): SqlJsDatabase { return this._db; }
}

class CacheStatementProxy {
  private owner: CachePersistentDatabase; private sql: string;
  constructor(owner: CachePersistentDatabase, sql: string) { this.owner = owner; this.sql = sql; }
  run(...params: unknown[]): void { this.owner.run(this.sql, params); }
  get<T = unknown>(...params: unknown[]): T | undefined {
    const stmt = this.owner.rawDb.prepare(this.sql);
    if (params?.length) stmt.bind(params);
    if (stmt.step()) { const r = stmt.getAsObject() as T; stmt.free(); return r; }
    stmt.free(); return undefined;
  }
  get source(): string { return this.sql; }
}

export class SQLiteCacheBackend {
  private dbPath: string;
  private db: CachePersistentDatabase | null = null;
  private initPromise: Promise<void>;

  constructor(dbPath?: string) {
    const dataDir = process.env.FILES_DIR || process.cwd();
    this.dbPath = dbPath || path.join(dataDir, 'data', 'compression_cache.db');
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    const dbDir = path.dirname(this.dbPath);
    if (dbDir && !fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const SQL = await initSqlJs();
    let db: SqlJsDatabase;
    if (fs.existsSync(this.dbPath)) {
      db = new SQL.Database(fs.readFileSync(this.dbPath));
    } else {
      db = new SQL.Database();
    }

    this.db = new CachePersistentDatabase(db, this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS compression_cache (
        cache_key TEXT PRIMARY KEY,
        original_hash TEXT NOT NULL,
        compressed_result TEXT NOT NULL,
        target_ratio REAL NOT NULL,
        original_tokens INTEGER,
        compressed_tokens INTEGER,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        access_count INTEGER DEFAULT 0
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_expires_at 
      ON compression_cache(expires_at)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_original_hash 
      ON compression_cache(original_hash)
    `);
  }

  async get(key: string): Promise<Record<string, unknown> | null> {
    await this.initPromise;

    if (!this.db) {
      return null;
    }

    const row = this.db.prepare(
      `SELECT compressed_result, expires_at, access_count
       FROM compression_cache
       WHERE cache_key = ?`
    ).get(key) as CacheEntry | undefined;

    if (!row) {
      return null;
    }

    const expiresAt = new Date(row.expires_at);
    if (new Date() > expiresAt) {
      this.db.prepare(
        `DELETE FROM compression_cache WHERE cache_key = ?`
      ).run(key);
      return null;
    }

    this.db.prepare(
      `UPDATE compression_cache SET access_count = access_count + 1 WHERE cache_key = ?`
    ).run(key);

    return JSON.parse(row.compressed_result);
  }

  async set(
    key: string,
    originalHash: string,
    value: Record<string, unknown>,
    targetRatio: number,
    originalTokens: number,
    compressedTokens: number,
    ttlSeconds: number = 3600
  ): Promise<void> {
    await this.initPromise;

    if (!this.db) {
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    this.db.prepare(
      `INSERT OR REPLACE INTO compression_cache
       (cache_key, original_hash, compressed_result, target_ratio, 
        original_tokens, compressed_tokens, created_at, expires_at, access_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      key,
      originalHash,
      JSON.stringify(value),
      targetRatio,
      originalTokens,
      compressedTokens,
      now.toISOString(),
      expiresAt.toISOString(),
    );
  }

  async cleanupExpired(): Promise<void> {
    await this.initPromise;

    if (!this.db) {
      return;
    }

    this.db.prepare(
      `DELETE FROM compression_cache WHERE expires_at < ?`
    ).run(new Date().toISOString());
  }

  async getStats(): Promise<{
    totalEntries: number;
    totalAccess: number;
    avgCompressionRatio: string;
  }> {
    await this.initPromise;

    if (!this.db) {
      return {
        totalEntries: 0,
        totalAccess: 0,
        avgCompressionRatio: 'N/A',
      };
    }

    const row = this.db.prepare(
      `SELECT 
        COUNT(*) as total_entries,
        SUM(access_count) as total_access,
        AVG(compressed_tokens * 1.0 / original_tokens) as avg_ratio
       FROM compression_cache
       WHERE expires_at > ?`
    ).get(new Date().toISOString()) as any;

    return {
      totalEntries: row?.total_entries || 0,
      totalAccess: row?.total_access || 0,
      avgCompressionRatio: row?.avg_ratio 
        ? `${(row.avg_ratio * 100).toFixed(2)}%` 
        : 'N/A',
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
