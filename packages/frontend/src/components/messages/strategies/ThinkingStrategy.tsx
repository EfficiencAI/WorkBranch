import type { MergedSegment } from '../types';
import { MergedSegmentType } from '../types';
import { BaseSegmentRenderer } from './base';

export class ThinkingStrategy extends BaseSegmentRenderer {
  readonly segmentType = MergedSegmentType.THINKING;

  renderToXml(segment: MergedSegment): string {
    const escapedContent = segment.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<thinking mid="${segment.mid}">${escapedContent}</thinking>`;
  }
}
