// Simplified type after delta merging (uppercase internal convention)
export const MergedSegmentType = {
  TEXT: 'TEXT',
  THINKING: 'THINKING',
  PLAN: 'PLAN',
  STATE_CHANGE: 'STATE_CHANGE',
  TOOL_CALL: 'TOOL_CALL',
  TOOL_RES: 'TOOL_RES',
  ERROR: 'ERROR',
  DONE: 'DONE',
} as const;

export type MergedSegmentType = typeof MergedSegmentType[keyof typeof MergedSegmentType];

// Merged segment after combining consecutive deltas of same type+mid
export interface MergedSegment {
  mid: string;
  type: MergedSegmentType;
  content: string;
  meta: Record<string, unknown>;
}
