import React from 'react';
import type { ContentBlock } from '@workbranch/shared';
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
    if (Array.isArray(blocks) && blocks.length > 0) {
      return blocks;
    }

    // JSON 解析成功但格式不符合预期（空数组或非数组）
    console.warn(
      `[MessageRenderer] assistantContent 解析为非标准格式，预期 ContentBlock[] 数组。` +
      `实际类型: ${typeof blocks}, 长度: ${Array.isArray(blocks) ? blocks.length : 'N/A'}。` +
      `内容预览: ${rawContent.substring(0, 100)}...`
    );
  } catch (e) {
    // JSON 解析失败：说明是纯文本格式而非 JSON 数组
    // 使用 text_delta 类型包装以确保能被 mergeSegments 正确处理
    console.warn(
      `[MessageRenderer] assistantContent 为纯文本格式（非 JSON ContentBlock[]），` +
      `已自动降级为 text_delta 包装。` +
      `如需消除此警告，请确保后端存储的 assistant_content 为 JSON 格式。` +
      `\n内容预览: ${rawContent.substring(0, 80)}`
    );
    
    return [{ type: 'text_delta' as any, content: rawContent }];
  }
  
  return [];
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
    // 静默兜底点：所有 segment 都被过滤或合并后无文本内容
    if (content && content.trim()) {
      console.warn(
        `[MessageRenderer] 消息 ${messageId} 有原始内容但渲染结果为空。` +
        `\n原始内容长度: ${content.length}, 解析块数: ${blocks.length}, 合并段数: ${segments.length}` +
        `\n原始内容预览: ${content.substring(0, 100)}`
      );
    }
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
