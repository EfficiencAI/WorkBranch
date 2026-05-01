import type { CompactionState } from '../../state/subgraph-states';
import { logger } from '../../../../core/logging';

export function estimateTokenCount(messages: unknown[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg === 'string') {
      total += Math.floor(msg.length / 4);
    } else if (typeof msg === 'object' && msg !== null) {
      total += Math.floor(JSON.stringify(msg).length / 4);
    } else {
      total += Math.floor(String(msg).length / 4);
    }
  }
  return total;
}

export function compressMessages(
  messages: unknown[],
  keepRecent: number = 2,
): { compressed: unknown[]; summary: string } {
  if (messages.length <= keepRecent + 1) {
    return { compressed: messages, summary: '' };
  }

  const oldMessages = messages.slice(0, -keepRecent);
  const recentMessages = messages.slice(-keepRecent);

  const summaryParts: string[] = [];
  for (let i = 0; i < oldMessages.length; i++) {
    const msg = oldMessages[i];
    if (typeof msg === 'string') {
      summaryParts.push(`[${i + 1}] ${msg.slice(0, 100)}...`);
    } else if (typeof msg === 'object' && msg !== null) {
      const obj = msg as Record<string, unknown>;
      summaryParts.push(`[${i + 1}] ${String(obj.content || obj).slice(0, 100)}...`);
    } else {
      summaryParts.push(`[${i + 1}] ${String(msg).slice(0, 100)}...`);
    }
  }

  const summary = `历史消息摘要 (${oldMessages.length} 条):\n${summaryParts.join('\n')}`;

  const compressed: unknown[] = [
    { role: 'system', content: summary },
    ...recentMessages,
  ];

  return { compressed, summary };
}

export function checkCompaction(state: CompactionState): Partial<CompactionState> {
  logger.info({ event: 'compaction.check', message_count: state.messages.length });

  const messages = state.messages;
  const maxMessages = state.max_messages || 10;

  const tokenCount = estimateTokenCount(messages);
  const messageCount = messages.length;

  logger.info({
    event: 'compaction.check_result',
    message_count: messageCount,
    estimated_tokens: tokenCount,
    max_messages: maxMessages,
  });

  if (messageCount > maxMessages) {
    logger.info({ event: 'compaction.needed', message_count: messageCount, max_messages: maxMessages });
    return { compressed: false };
  }

  logger.info({ event: 'compaction.not_needed' });
  return { compressed: true };
}

export function routeByCompaction(state: CompactionState): 'skip' | 'compress' {
  return state.compressed ? 'skip' : 'compress';
}

export function doCompaction(state: CompactionState): Partial<CompactionState> {
  logger.info({ event: 'compaction.execute' });

  const messages = state.messages;
  const maxMessages = state.max_messages || 10;
  const keepRecent = Math.floor(maxMessages / 2);

  const { compressed, summary } = compressMessages(messages, keepRecent);

  logger.info({
    event: 'compaction.completed',
    before_count: messages.length,
    after_count: compressed.length,
    summary_length: summary.length,
  });

  return {
    messages: compressed,
    compressed: true,
    summary,
  };
}

export function skipCompaction(_state: CompactionState): Partial<CompactionState> {
  return { compressed: true };
}

export function runCompaction(
  messages: unknown[],
  maxMessages: number = 10,
): { messages: unknown[]; compressed: boolean; summary: string } {
  logger.info({ event: 'compaction.run', message_count: messages.length, max_messages: maxMessages });

  const initialState: CompactionState = {
    messages,
    max_messages: maxMessages,
    compressed: false,
    summary: '',
  };

  const checkResult = checkCompaction(initialState);

  if (checkResult.compressed) {
    return {
      messages: initialState.messages,
      compressed: true,
      summary: '',
    };
  }

  const compactionResult = doCompaction({ ...initialState, ...checkResult });

  return {
    messages: compactionResult.messages || initialState.messages,
    compressed: compactionResult.compressed ?? true,
    summary: compactionResult.summary || '',
  };
}
