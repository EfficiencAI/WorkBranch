import * as crypto from 'crypto';

export class CacheKeyGenerator {
  private static normalizeContent(content: string): string {
    let normalized = content.replace(/\s+/g, ' ');
    normalized = normalized.trim();
    normalized = normalized.replace(/\r\n/g, '\n');
    return normalized;
  }

  private static extractKeyInfo(message: Record<string, unknown>): string {
    const role = (message.role as string) || 'unknown';

    let content: string;
    if (message.parts && Array.isArray(message.parts)) {
      const textParts: string[] = [];
      for (const part of message.parts as Array<Record<string, unknown>>) {
        if (part.type === 'text') {
          textParts.push((part.text as string) || '');
        }
      }
      content = textParts.join(' ');
    } else if (message.content) {
      content = typeof message.content === 'string' 
        ? message.content 
        : JSON.stringify(message.content);
    } else {
      content = JSON.stringify(message);
    }

    return `${role}:${content}`;
  }

  static generate(
    targetMessage: Record<string, unknown>,
    targetRatio: number,
    compressionVersion: string = 'v1'
  ): string {
    const role = (targetMessage.role as string) || 'unknown';
    const content = CacheKeyGenerator.extractKeyInfo(targetMessage);

    const normalized = CacheKeyGenerator.normalizeContent(content);

    const cacheFactors = {
      role,
      content: normalized,
      target_ratio: Math.round(targetRatio * 100) / 100,
      version: compressionVersion,
      method: 'convolution',
    };

    const cacheStr = JSON.stringify(cacheFactors);

    const cacheKey = crypto
      .createHash('sha256')
      .update(cacheStr, 'utf8')
      .digest('hex');

    return cacheKey;
  }

  static generateHash(content: string): string {
    return crypto
      .createHash('sha256')
      .update(content, 'utf8')
      .digest('hex');
  }
}
