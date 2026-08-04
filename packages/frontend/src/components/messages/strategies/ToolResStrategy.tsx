import type { MergedSegment } from '../types';
import { MergedSegmentType } from '../types';
import { BaseSegmentRenderer } from './base';

export class ToolResStrategy extends BaseSegmentRenderer {
  readonly segmentType = MergedSegmentType.TOOL_RES;

  renderToXml(segment: MergedSegment): string {
    const escapedContent = segment.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const metaAttr =
      Object.keys(segment.meta).length > 0
        ? ` meta="${JSON.stringify(segment.meta).replace(/"/g, '&quot;')}"`
        : '';
    return `<tool_res mid="${segment.mid}"${metaAttr}>${escapedContent}</tool_res>`;
  }
}
