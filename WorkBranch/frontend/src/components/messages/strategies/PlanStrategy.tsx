import type { MergedSegment } from '../types';
import { MergedSegmentType } from '../types';
import { BaseSegmentRenderer } from './base';

export class PlanStrategy extends BaseSegmentRenderer {
  readonly segmentType = MergedSegmentType.PLAN;

  renderToXml(segment: MergedSegment): string {
    const escapedContent = segment.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<plan mid="${segment.mid}">${escapedContent}</plan>`;
  }
}
