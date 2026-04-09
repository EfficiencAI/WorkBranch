import { MergedSegmentType } from '../types';
import type { SegmentRenderer } from './base';
import { TextStrategy } from './TextStrategy';
import { ThinkingStrategy } from './ThinkingStrategy';
import { PlanStrategy } from './PlanStrategy';
import { ToolCallStrategy } from './ToolCallStrategy';
import { ToolResStrategy } from './ToolResStrategy';
import { ErrorStrategy } from './ErrorStrategy';
import { StateChangeStrategy } from './StateChangeStrategy';

// Registry: maps each MergedSegmentType to its renderer strategy
const strategyRegistry: Record<MergedSegmentType, SegmentRenderer> = {
  [MergedSegmentType.TEXT]: new TextStrategy(),
  [MergedSegmentType.THINKING]: new ThinkingStrategy(),
  [MergedSegmentType.PLAN]: new PlanStrategy(),
  [MergedSegmentType.TOOL_CALL]: new ToolCallStrategy(),
  [MergedSegmentType.TOOL_RES]: new ToolResStrategy(),
  [MergedSegmentType.ERROR]: new ErrorStrategy(),
  [MergedSegmentType.STATE_CHANGE]: new StateChangeStrategy(),
  [MergedSegmentType.DONE]: new TextStrategy(), // DONE uses text renderer (no content)
};

export function getRenderer(type: MergedSegmentType): SegmentRenderer {
  const renderer = strategyRegistry[type];
  if (!renderer) {
    throw new Error(`No renderer registered for segment type: ${type}`);
  }
  return renderer;
}

export { strategyRegistry };
export * from './base';
export * from './TextStrategy';
export * from './ThinkingStrategy';
export * from './PlanStrategy';
export * from './ToolCallStrategy';
export * from './ToolResStrategy';
export * from './ErrorStrategy';
export * from './StateChangeStrategy';
