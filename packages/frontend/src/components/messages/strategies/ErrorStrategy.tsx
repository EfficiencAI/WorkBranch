import type { MergedSegment } from '../types';
import { MergedSegmentType } from '../types';
import { BaseSegmentRenderer } from './base';

export class ErrorStrategy extends BaseSegmentRenderer {
  readonly segmentType = MergedSegmentType.ERROR;

  renderToXml(segment: MergedSegment): string {
    const escapedContent = segment.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<error mid="${segment.mid}">${escapedContent}</error>`;
  }
}
