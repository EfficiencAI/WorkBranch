interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

export class LRUCache<T = Record<string, unknown>> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private ttlSeconds: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number = 100, ttlSeconds: number = 3600) {
    this.maxSize = maxSize;
    this.ttlSeconds = ttlSeconds;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.ttlSeconds * 1000) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: string;
  } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: `${(hitRate * 100).toFixed(2)}%`,
    };
  }
}
