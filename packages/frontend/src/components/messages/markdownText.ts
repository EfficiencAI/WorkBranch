import { SegmentType, type ContentBlock } from '@workbranch/shared';
import { MergedSegmentType } from './types';
import { mergeSegments } from './SegmentMerger';

export function parseContentBlocks(rawContent: string): ContentBlock[] {
  if (!rawContent || !rawContent.trim()) return [];

  try {
    const blocks = JSON.parse(rawContent) as ContentBlock[];
    if (Array.isArray(blocks)) return blocks;
  } catch {
    return [{ type: SegmentType.TEXT_DELTA, content: rawContent }];
  }

  return [{ type: SegmentType.TEXT_DELTA, content: rawContent }];
}

/**
 * 提取界面上实际渲染为 markdown 的原文（TEXT + PLAN 分段），
 * 不含 thinking / tool_call / tool_res 等中间过程。
 */
export function extractMarkdownText(rawContent: string): string {
  const segments = mergeSegments(parseContentBlocks(rawContent), '');
  return segments
    .filter(
      (segment) =>
        segment.type === MergedSegmentType.TEXT || segment.type === MergedSegmentType.PLAN,
    )
    .map((segment) => segment.content)
    .join('');
}