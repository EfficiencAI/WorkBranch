import type { ContentBlock, SegmentType } from '../../shared/api/workspace';
import type { MergedSegment } from './types';
import { MergedSegmentType } from './types';

// Maps each raw API SegmentType (lowercase) to its merged base type
const DELTA_TYPE_MAP: Partial<Record<SegmentType, MergedSegmentType>> = {
  text_start: MergedSegmentType.TEXT,
  text_delta: MergedSegmentType.TEXT,
  text_end: MergedSegmentType.TEXT,
  thinking_start: MergedSegmentType.THINKING,
  thinking_delta: MergedSegmentType.THINKING,
  thinking_end: MergedSegmentType.THINKING,
  plan_start: MergedSegmentType.PLAN,
  plan_delta: MergedSegmentType.PLAN,
  plan_end: MergedSegmentType.PLAN,
  state_change: MergedSegmentType.STATE_CHANGE,
  tool_call: MergedSegmentType.TOOL_CALL,
  tool_res: MergedSegmentType.TOOL_RES,
  error: MergedSegmentType.ERROR,
  done: MergedSegmentType.DONE,
};

/**
 * Merges consecutive ContentBlocks of the same type into a single MergedSegment.
 * START/END blocks contribute no visible content; only DELTA blocks accumulate content.
 *
 * @param blocks     Raw ContentBlock list from the API (all belong to the same message)
 * @param messageId  The message ID to attach to each MergedSegment
 */
export function mergeSegments(blocks: ContentBlock[], messageId: string): MergedSegment[] {
  const result: MergedSegment[] = [];
  let currentType: MergedSegmentType | null = null;
  let contentBuffer = '';
  let currentMeta: Record<string, unknown> = {};

  const flush = () => {
    if (currentType !== null) {
      result.push({
        mid: messageId,
        type: currentType,
        content: contentBuffer,
        meta: currentMeta,
      });
    }
    currentType = null;
    contentBuffer = '';
    currentMeta = {};
  };

  for (const block of blocks) {
    const mergedType = DELTA_TYPE_MAP[block.type];
    if (mergedType === undefined) continue;

    if (mergedType !== currentType) {
      flush();
      currentType = mergedType;
      currentMeta = block.metadata ?? {};
    }

    // Only accumulate DELTA payloads; START/END carry no visible content
    if (block.type.endsWith('_delta')) {
      contentBuffer += block.content ?? '';
    } else if (!block.type.endsWith('_start') && !block.type.endsWith('_end')) {
      // Non-stream types (state_change, tool_call, tool_res, error, done)
      contentBuffer += block.content ?? '';
    }
  }

  flush();
  return result;
}
