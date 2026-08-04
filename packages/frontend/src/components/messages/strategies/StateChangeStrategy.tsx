import type { MergedSegment } from '../types';
import { MergedSegmentType } from '../types';
import { BaseSegmentRenderer } from './base';

export class StateChangeStrategy extends BaseSegmentRenderer {
  readonly segmentType = MergedSegmentType.STATE_CHANGE;

  renderToXml(segment: MergedSegment): string {
    const escapedContent = segment.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<state_change mid="${segment.mid}">${escapedContent}</state_change>`;
  }
}
