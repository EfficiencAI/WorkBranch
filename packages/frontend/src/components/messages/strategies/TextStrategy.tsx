import type { MergedSegment } from '../types';
import { MergedSegmentType } from '../types';
import { BaseSegmentRenderer } from './base';

export class TextStrategy extends BaseSegmentRenderer {
  readonly segmentType = MergedSegmentType.TEXT;

  renderToXml(segment: MergedSegment): string {
    const escapedContent = segment.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<text mid="${segment.mid}">${escapedContent}</text>`;
  }
}
