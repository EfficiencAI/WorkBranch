import { LRUCache } from './lru-cache';
import { SQLiteCacheBackend } from './sqlite-cache';
import { CacheKeyGenerator } from './key-generator';

export class CompressionCache {
  private l1Cache: LRUCache;
  private l2Cache: SQLiteCacheBackend;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    l1MaxSize: number = 100,
    l1TtlSeconds: number = 3600,
    l2DbPath: string = 'data/compression_cache.db'
  ) {
    this.l1Cache = new LRUCache(l1MaxSize, l1TtlSeconds);
    this.l2Cache = new SQLiteCacheBackend(l2DbPath);
    
    this.startCleanupTask();
  }

  async get(key: string): Promise<Record<string, unknown> | null> {
    const l1Result = this.l1Cache.get(key);
    if (l1Result) {
      return l1Result;
    }

    const l2Result = await this.l2Cache.get(key);
    if (l2Result) {
      this.l1Cache.set(key, l2Result);
      return l2Result;
    }

    return null;
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
    this.l1Cache.set(key, value);
    
    await this.l2Cache.set(
      key,
      originalHash,
      value,
      targetRatio,
      originalTokens,
      compressedTokens,
      ttlSeconds
    );
  }

  async getStats(): Promise<{
    l1: ReturnType<LRUCache['getStats']>;
    l2: Awaited<ReturnType<SQLiteCacheBackend['getStats']>>;
  }> {
    const l1Stats = this.l1Cache.getStats();
    const l2Stats = await this.l2Cache.getStats();
    
    return {
      l1: l1Stats,
      l2: l2Stats,
    };
  }

  async invalidateAll(): Promise<void> {
    this.l1Cache.clear();
  }

  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.l2Cache.cleanupExpired();
      } catch (err) {
        console.error('[CacheCleanup] Error:', err);
      }
    }, 3600 * 1000);
  }

  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  async close(): Promise<void> {
    this.stopCleanupTask();
    await this.l2Cache.close();
  }
}

export const compressionCache = new CompressionCache();

export { LRUCache, SQLiteCacheBackend, CacheKeyGenerator };
