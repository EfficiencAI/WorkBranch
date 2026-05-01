import { CompressionCache } from '../cache';
import { SegmentType } from '../../session-service/canonical';

interface ConvolutionWindow {
  prev: Record<string, unknown> | null;
  target: Record<string, unknown>;
  next: Record<string, unknown> | null;
  targetIndex: number;
}

class TokenCalculator {
  private contextWindow: number;

  constructor() {
    this.contextWindow = 128000;
  }

  estimateTokens(content: string): number {
    const chineseChars = Array.from(content).filter(c => '\u4e00' <= c && c <= '\u9fff').length;
    const otherChars = content.length - chineseChars;
    return Math.floor(chineseChars / 1.5 + otherChars / 4);
  }

  calculateUsageRate(messages: Array<Record<string, unknown>>, systemPrompt: string = ''): number {
    let totalTokens = this.estimateTokens(systemPrompt);

    for (const msg of messages) {
      const content = this.extractContent(msg);
      totalTokens += this.estimateTokens(content);
    }

    return totalTokens / this.contextWindow;
  }

  extractContent(message: Record<string, unknown>): string {
    if (message.parts && Array.isArray(message.parts)) {
      const textParts: string[] = [];
      for (const part of message.parts as Array<Record<string, unknown>>) {
        if (part.type === 'text') {
          textParts.push((part.text as string) || '');
        }
      }
      return textParts.join(' ');
    } else if (message.content) {
      return String(message.content);
    }
    return String(message);
  }
}

class ConvolutionCompressor {
  // @ts-expect-error reserved for async LLM compression
  private _cache: CompressionCache;
  private tokenCalculator: TokenCalculator;
  private keepRecent: number;
  private minLength: number;
  private triggerThreshold: number;
  private targetMin: number;
  private targetMax: number;
  // @ts-expect-error reserved for async LLM compression
  private _compressionVersion: string;

  constructor(
    cache: CompressionCache,
    options: {
      keepRecent?: number;
      minLength?: number;
      triggerThreshold?: number;
      targetMin?: number;
      targetMax?: number;
      compressionVersion?: string;
    } = {}
  ) {
    this._cache = cache;
    this.tokenCalculator = new TokenCalculator();
    this.keepRecent = options.keepRecent ?? 4;
    this.minLength = options.minLength ?? 100;
    this.triggerThreshold = options.triggerThreshold ?? 0.7;
    this.targetMin = options.targetMin ?? 0.3;
    this.targetMax = options.targetMax ?? 0.5;
    this._compressionVersion = options.compressionVersion ?? 'v1';
  }

  compressMessages(messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    const total = messages.length;
    if (total <= this.keepRecent) {
      return messages;
    }

    const recentStart = Math.max(0, total - this.keepRecent);

    const usageRate = this.tokenCalculator.calculateUsageRate(messages);
    if (usageRate < this.triggerThreshold) {
      return messages;
    }

    const targetRatio = this.calculateTargetRatio(usageRate);

    const result: Array<Record<string, unknown>> = [];

    for (let i = 0; i < total; i++) {
      if (i >= recentStart) {
        result.push(messages[i]);
        continue;
      }

      const content = this.tokenCalculator.extractContent(messages[i]);
      if (content.length < this.minLength) {
        result.push(messages[i]);
        continue;
      }

      const window = this.buildWindow(messages, i);
      const compressed = this.compressWithWindowSync(window, targetRatio);
      result.push(compressed);
    }

    return result;
  }

  private buildWindow(messages: Array<Record<string, unknown>>, targetIndex: number): ConvolutionWindow {
    return {
      prev: targetIndex > 0 ? messages[targetIndex - 1] : null,
      target: messages[targetIndex],
      next: targetIndex < messages.length - 1 ? messages[targetIndex + 1] : null,
      targetIndex,
    };
  }

  private compressWithWindowSync(window: ConvolutionWindow, _targetRatio: number): Record<string, unknown> {
    const targetContent = this.tokenCalculator.extractContent(window.target);
    const targetRole = (window.target.role as string) || 'unknown';

    const summaryParts: string[] = [];
    if (window.prev) {
      const prevContent = this.tokenCalculator.extractContent(window.prev);
      summaryParts.push(`[上文]: ${prevContent.slice(0, 200)}`);
    }
    summaryParts.push(`[${targetRole}]: ${targetContent.slice(0, 300)}`);
    if (window.next) {
      const nextContent = this.tokenCalculator.extractContent(window.next);
      summaryParts.push(`[下文]: ${nextContent.slice(0, 200)}`);
    }

    const compressedResult: Record<string, unknown> = {
      role: targetRole,
      summary: targetContent.slice(0, 500),
      context_relation: '',
      key_points: [targetContent.slice(0, 100)],
      result: '',
    };

    return this.buildCompressedMessage(window.target, compressedResult, window.targetIndex);
  }

  private buildCompressedMessage(
    original: Record<string, unknown>,
    compressedResult: Record<string, unknown>,
    index: number,
  ): Record<string, unknown> {
    return {
      role: original.role,
      content: `[压缩记录 #${index}]\n${JSON.stringify(compressedResult, null, 2)}`,
      compressed: true,
      original_length: this.tokenCalculator.extractContent(original).length,
      compressed_length: JSON.stringify(compressedResult).length,
    };
  }

  private calculateTargetRatio(currentRate: number): number {
    const targetRate = (this.targetMin + this.targetMax) / 2;
    return Math.min(targetRate / currentRate, 1.0);
  }
}

export class CompressionService {
  private enabled: boolean;
  private cache: CompressionCache;
  private compressor: ConvolutionCompressor;
  private tokenCalculator: TokenCalculator;
  private metrics = {
    total_requests: 0,
    compressed_requests: 0,
    total_compression_time: 0,
  };

  constructor(options?: {
    enabled?: boolean;
    keepRecent?: number;
    minLength?: number;
    triggerThreshold?: number;
    targetMin?: number;
    targetMax?: number;
    compressionVersion?: string;
  }) {
    this.enabled = options?.enabled ?? true;
    this.cache = new CompressionCache();
    this.compressor = new ConvolutionCompressor(this.cache, options);
    this.tokenCalculator = new TokenCalculator();
  }

  async compressMessages(
    messages: Array<Record<string, unknown>>,
    messageContext?: {
      send_message?: (content: string, type: SegmentType, metadata?: Record<string, unknown>) => Promise<void>;
    },
    source: string = 'unknown',
  ): Promise<{ messages: Array<Record<string, unknown>>; stats: Record<string, unknown> }> {
    if (!this.enabled || !messages || messages.length === 0) {
      return { messages, stats: {} };
    }

    const sendMessage = messageContext?.send_message;

    const originalTokens = messages.reduce(
      (sum, msg) => sum + this.tokenCalculator.estimateTokens(this.tokenCalculator.extractContent(msg)),
      0,
    );

    const startTime = Date.now();

    if (sendMessage) {
      await sendMessage('', SegmentType.COMPRESSION_START, {
        source,
        message_count: messages.length,
        original_tokens: originalTokens,
        is_start: true,
      });
    }

    this.metrics.total_requests++;

    const result = this.compressor.compressMessages(messages);

    const compressionTime = Date.now() - startTime;
    this.metrics.total_compression_time += compressionTime;

    const compressedCount = result.filter(msg => msg.compressed).length;
    if (compressedCount > 0) {
      this.metrics.compressed_requests++;
    }

    const compressedTokens = result.reduce(
      (sum, msg) => sum + this.tokenCalculator.estimateTokens(this.tokenCalculator.extractContent(msg)),
      0,
    );

    if (sendMessage) {
      await sendMessage('', SegmentType.COMPRESSION_END, {
        source,
        message_count: messages.length,
        compressed_count: compressedCount,
        original_tokens: originalTokens,
        compressed_tokens: compressedTokens,
        compression_time: Math.round(compressionTime) / 1000,
        is_end: true,
      });
    }

    const stats = {
      original_tokens: originalTokens,
      compressed_tokens: compressedTokens,
      compression_time: compressionTime,
      compressed_count: compressedCount,
    };

    return { messages: result, stats };
  }

  getStats(): Record<string, unknown> {
    const total = this.metrics.total_requests;
    const avgCompressionTime = total > 0
      ? this.metrics.total_compression_time / total
      : 0;

    return {
      total_requests: total,
      compressed_requests: this.metrics.compressed_requests,
      avg_compression_time: `${(avgCompressionTime / 1000).toFixed(2)}s`,
    };
  }
}

export const compressionService = new CompressionService();
export { TokenCalculator, ConvolutionCompressor };
