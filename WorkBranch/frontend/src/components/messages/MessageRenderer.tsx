import React from 'react';
import type { ContentBlock } from '../../shared/api/workspace';
import type { MergedSegment } from './types';
import { MergedSegmentType } from './types';
import { mergeSegments } from './SegmentMerger';
import { toXml, validateXmlStructure } from './XmlConverter';

interface MessageRendererProps {
  content: string;
  messageId: string;
}

function parseContentBlocks(rawContent: string): ContentBlock[] {
  if (!rawContent || !rawContent.trim()) {
    return [];
  }
  
  try {
    const blocks = JSON.parse(rawContent) as ContentBlock[];
    return Array.isArray(blocks) ? blocks : [];
  } catch {
    return [];
  }
}

function extractTextContent(segments: MergedSegment[]): string {
  return segments
    .filter(seg => seg.type === MergedSegmentType.TEXT || seg.type === MergedSegmentType.PLAN)
    .map(seg => seg.content)
    .join('');
}

/**
 * Phase 1: 将 assistantContent 包装为 XML 并在界面上直接展示，
 * 用于验证 XML 结构是否正确。
 * Phase 2 将在此基础上替换 pre 块为各策略组件的可视化渲染。
 */
export const MessageRenderer: React.FC<MessageRendererProps> = ({ content, messageId }) => {
  const blocks = parseContentBlocks(content);
  const segments = mergeSegments(blocks, messageId);
  const textContent = extractTextContent(segments);

  if (!textContent) {
    return null;
  }

  const xml = toXml(segments);
  const { valid, errors } = validateXmlStructure(xml);

  return (
    <>
      {valid ? xml : '[XML 结构错误] ' + errors.join(', ') + '\n\n' + xml}
    </>
  );
};

export default MessageRenderer;
