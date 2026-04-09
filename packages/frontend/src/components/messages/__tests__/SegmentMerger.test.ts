import { mergeSegments } from '../SegmentMerger';
import type { ContentBlock } from '../../../shared/api/workspace';
import { MergedSegmentType } from '../types';

const makeBlock = (overrides: Partial<ContentBlock>): ContentBlock => ({
  type: 'text_delta',
  content: '',
  ...overrides,
});

const MESSAGE_ID = 'mid1';

describe('mergeSegments', () => {
  it('returns empty array for empty input', () => {
    expect(mergeSegments([], MESSAGE_ID)).toEqual([]);
  });

  it('merges consecutive TEXT deltas', () => {
    const blocks = [
      makeBlock({ type: 'text_start', content: '' }),
      makeBlock({ type: 'text_delta', content: 'Hello ' }),
      makeBlock({ type: 'text_delta', content: 'World' }),
      makeBlock({ type: 'text_end', content: '' }),
    ];
    const result = mergeSegments(blocks, MESSAGE_ID);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(MergedSegmentType.TEXT);
    expect(result[0].content).toBe('Hello World');
    expect(result[0].mid).toBe(MESSAGE_ID);
  });

  it('merges consecutive THINKING deltas', () => {
    const blocks = [
      makeBlock({ type: 'thinking_start' }),
      makeBlock({ type: 'thinking_delta', content: 'Think ' }),
      makeBlock({ type: 'thinking_delta', content: 'more' }),
      makeBlock({ type: 'thinking_end' }),
    ];
    const result = mergeSegments(blocks, MESSAGE_ID);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(MergedSegmentType.THINKING);
    expect(result[0].content).toBe('Think more');
  });

  it('does NOT merge blocks of different types', () => {
    const blocks = [
      makeBlock({ type: 'text_delta', content: 'text' }),
      makeBlock({ type: 'thinking_delta', content: 'think' }),
    ];
    const result = mergeSegments(blocks, MESSAGE_ID);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe(MergedSegmentType.TEXT);
    expect(result[1].type).toBe(MergedSegmentType.THINKING);
  });

  it('produces correct merged type for PLAN deltas', () => {
    const blocks = [
      makeBlock({ type: 'plan_start' }),
      makeBlock({ type: 'plan_delta', content: 'Step 1' }),
      makeBlock({ type: 'plan_end' }),
    ];
    const result = mergeSegments(blocks, MESSAGE_ID);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(MergedSegmentType.PLAN);
    expect(result[0].content).toBe('Step 1');
  });

  it('preserves metadata from first block in group', () => {
    const blocks = [
      makeBlock({ type: 'text_start', metadata: { source: 'llm' } }),
      makeBlock({ type: 'text_delta', content: 'hi' }),
    ];
    const result = mergeSegments(blocks, MESSAGE_ID);
    expect(result[0].meta).toEqual({ source: 'llm' });
  });

  it('handles state_change as single non-streamed block', () => {
    const blocks = [makeBlock({ type: 'state_change', content: 'idle' })];
    const result = mergeSegments(blocks, MESSAGE_ID);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(MergedSegmentType.STATE_CHANGE);
    expect(result[0].content).toBe('idle');
  });
});
