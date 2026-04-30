export enum SegmentType {
  THINKING_START = 'thinking_start',
  THINKING_DELTA = 'thinking_delta',
  THINKING_END = 'thinking_end',
  THINKING = 'thinking',
  TEXT_START = 'text_start',
  TEXT_DELTA = 'text_delta',
  TEXT_END = 'text_end',
  CHAT_START = 'chat_start',
  CHAT_DELTA = 'chat_delta',
  CHAT_END = 'chat_end',
  PLAN_START = 'plan_start',
  PLAN_DELTA = 'plan_delta',
  PLAN_END = 'plan_end',
  STATE_CHANGE = 'state_change',
  TOOL_CALL = 'tool_call',
  TOOL_RES = 'tool_res',
  ERROR = 'error',
  DONE = 'done',
}

export interface Segment {
  cid: string;
  mid: string;
  idx: number;
  type: SegmentType;
  payload: string;
  meta: Record<string, unknown>;
}

export interface ContentBlock {
  type: SegmentType;
  content: string;
  metadata: Record<string, unknown>;
}

export interface Message {
  role: string;
  message_id: string;
  conversation_id: string;
  session_id: string;
  workspace_id: string;
  content_blocks: ContentBlock[];
  content: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

let counter: Record<string, number> = {};

function nextIdx(mid: string): number {
  if (!(mid in counter)) {
    counter[mid] = 0;
  }
  counter[mid]++;
  return counter[mid];
}

export function resetCounter(mid?: string): void {
  if (mid) {
    delete counter[mid];
  } else {
    counter = {};
  }
}

export function buildSegment(
  cid: string,
  mid: string,
  segmentType: SegmentType,
  payload: string = '',
  meta: Record<string, unknown> = {}
): Segment {
  return {
    cid,
    mid,
    idx: nextIdx(mid),
    type: segmentType,
    payload,
    meta,
  };
}

export function createContentBlock(
  type: SegmentType,
  content: string = '',
  metadata: Record<string, unknown> = {}
): ContentBlock {
  return { type, content, metadata };
}

export function createMessage(
  role: string,
  messageId: string,
  conversationId: string,
  sessionId: string,
  workspaceId: string,
  contentBlocks: ContentBlock[] = [],
  content: string = '',
  metadata: Record<string, unknown> = {}
): Message {
  return {
    role,
    message_id: messageId,
    conversation_id: conversationId,
    session_id: sessionId,
    workspace_id: workspaceId,
    content_blocks: contentBlocks,
    content,
    timestamp: new Date().toISOString(),
    metadata,
  };
}

export function messageToDict(message: Message): Record<string, unknown> {
  return {
    role: message.role,
    message_id: message.message_id,
    conversation_id: message.conversation_id,
    session_id: message.session_id,
    workspace_id: message.workspace_id,
    content_blocks: message.content_blocks.map((b) => ({
      type: b.type,
      content: b.content,
      metadata: b.metadata,
    })),
    content: message.content,
    timestamp: message.timestamp,
    metadata: message.metadata,
  };
}
