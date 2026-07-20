import React from 'react';
import { SegmentType, type ContentBlock } from '@workbranch/shared';
import type { MergedSegment } from './types';
import { MergedSegmentType } from './types';
import { mergeSegments } from './SegmentMerger';

interface MessageRendererProps {
  content: string;
  messageId: string;
}

function parseContentBlocks(rawContent: string): ContentBlock[] {
  if (!rawContent || !rawContent.trim()) return [];

  try {
    const blocks = JSON.parse(rawContent) as ContentBlock[];
    if (Array.isArray(blocks)) return blocks;
  } catch {
    return [{ type: SegmentType.TEXT_DELTA, content: rawContent }];
  }

  return [{ type: SegmentType.TEXT_DELTA, content: rawContent }];
}

function getWorkflowLabel(type: MergedSegmentType): string {
  if (type === MergedSegmentType.STATE_CHANGE) return '步骤状态';
  if (type === MergedSegmentType.THINKING) return '工作判断';
  if (type === MergedSegmentType.TOOL_CALL) return '工具调用';
  if (type === MergedSegmentType.TOOL_RES) return '工具结果';
  if (type === MergedSegmentType.ERROR) return '执行错误';
  return '执行过程';
}

function getWorkflowTone(type: MergedSegmentType): string {
  if (type === MergedSegmentType.TOOL_CALL) return 'tool-call';
  if (type === MergedSegmentType.TOOL_RES) return 'tool-result';
  if (type === MergedSegmentType.ERROR) return 'error';
  if (type === MergedSegmentType.THINKING) return 'thinking';
  return 'state';
}

function WorkflowItem({ segment }: { segment: MergedSegment }) {
  const stepNumber = segment.meta.step_number;
  const toolName = segment.meta.tool_name;
  const metaLabel = [
    typeof stepNumber === 'number' ? `Step ${stepNumber}` : null,
    typeof toolName === 'string' ? toolName : null,
  ].filter(Boolean).join(' · ');

  const preserveFormatting =
    segment.type === MergedSegmentType.TOOL_CALL || segment.type === MergedSegmentType.TOOL_RES;

  return (
    <div className={`agent-workflow__item agent-workflow__item--${getWorkflowTone(segment.type)}`}>
      <div className="agent-workflow__item-header">
        <span className="agent-workflow__item-label">{getWorkflowLabel(segment.type)}</span>
        {metaLabel ? <span className="agent-workflow__item-meta">{metaLabel}</span> : null}
      </div>
      {segment.content ? (
        preserveFormatting
          ? <pre className="agent-workflow__item-content agent-workflow__item-content--code">{segment.content}</pre>
          : <div className="agent-workflow__item-content">{segment.content}</div>
      ) : null}
    </div>
  );
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({ content, messageId }) => {
  const blocks = parseContentBlocks(content);
  const segments = mergeSegments(blocks, messageId);
  const workflowSegments = segments.filter((segment) =>
    segment.type !== MergedSegmentType.TEXT &&
    segment.type !== MergedSegmentType.PLAN &&
    segment.type !== MergedSegmentType.DONE
  );
  const responseSegments = segments.filter((segment) =>
    segment.type === MergedSegmentType.TEXT || segment.type === MergedSegmentType.PLAN
  );

  if (segments.length === 0) return null;

  return (
    <div className="agent-message">
      {workflowSegments.length > 0 ? (
        <details className="agent-workflow" open>
          <summary className="agent-workflow__summary">
            Agent 执行过程 <span>{workflowSegments.length} 项</span>
          </summary>
          <div className="agent-workflow__items">
            {workflowSegments.map((segment, index) => (
              <WorkflowItem key={`${segment.type}-${index}`} segment={segment} />
            ))}
          </div>
        </details>
      ) : null}

      {responseSegments.length > 0 ? (
        <div className="agent-response">
          {responseSegments.map((segment, index) => (
            <div className="agent-response__text" key={`${segment.type}-${index}`}>
              {segment.content}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default MessageRenderer;
