import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
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

export class SQLiteCacheBackend {
  private dbPath: string;
  private db: SqlJsDatabase | null = null;
  private SQL: SqlJsStatic | null = null;
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

    this.SQL = await initSqlJs({
      locateFile: (file: string) => {
        const devPath = path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'sql.js', 'dist', file);
        if (fs.existsSync(devPath)) {
          return devPath;
        }
        const bundlePath = path.join(__dirname, file);
        if (fs.existsSync(bundlePath)) {
          return bundlePath;
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

    this.db.run(`
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

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_expires_at 
      ON compression_cache(expires_at)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_original_hash 
      ON compression_cache(original_hash)
    `);

    this.save();
  }

  private save(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  async get(key: string): Promise<Record<string, unknown> | null> {
    await this.initPromise;
    
    if (!this.db) {
      return null;
    }

    const stmt = this.db.prepare(
      `SELECT compressed_result, expires_at, access_count
       FROM compression_cache
       WHERE cache_key = ?`,
      [key]
    );

    if (!stmt.step()) {
      stmt.free();
      return null;
    }

    const row = stmt.getAsObject() as CacheEntry;
    stmt.free();

    const expiresAt = new Date(row.expires_at);
    if (new Date() > expiresAt) {
      this.db.run(
        `DELETE FROM compression_cache WHERE cache_key = ?`,
        [key]
      );
      this.save();
      return null;
    }

    this.db.run(
      `UPDATE compression_cache SET access_count = access_count + 1 WHERE cache_key = ?`,
      [key]
    );
    this.save();

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

    this.db.run(
      `INSERT OR REPLACE INTO compression_cache
       (cache_key, original_hash, compressed_result, target_ratio, 
        original_tokens, compressed_tokens, created_at, expires_at, access_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        key,
        originalHash,
        JSON.stringify(value),
        targetRatio,
        originalTokens,
        compressedTokens,
        now.toISOString(),
        expiresAt.toISOString(),
      ]
    );

    this.save();
  }

  async cleanupExpired(): Promise<void> {
    await this.initPromise;
    
    if (!this.db) {
      return;
    }

    this.db.run(
      `DELETE FROM compression_cache WHERE expires_at < ?`,
      [new Date().toISOString()]
    );
    this.save();
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

    const stmt = this.db.prepare(
      `SELECT 
        COUNT(*) as total_entries,
        SUM(access_count) as total_access,
        AVG(compressed_tokens * 1.0 / original_tokens) as avg_ratio
       FROM compression_cache
       WHERE expires_at > ?`,
      [new Date().toISOString()]
    );

    if (!stmt.step()) {
      stmt.free();
      return {
        totalEntries: 0,
        totalAccess: 0,
        avgCompressionRatio: 'N/A',
      };
    }

    const row = stmt.getAsObject() as {
      total_entries: number;
      total_access: number;
      avg_ratio: number | null;
    };
    stmt.free();

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
      this.save();
      this.db.close();
      this.db = null;
    }
  }
}
