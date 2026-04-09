export declare enum SegmentType {
    THINKING_START = "thinking_start",
    THINKING_DELTA = "thinking_delta",
    THINKING_END = "thinking_end",
    THINKING = "thinking",
    TEXT_START = "text_start",
    TEXT_DELTA = "text_delta",
    TEXT_END = "text_end",
    PLAN_START = "plan_start",
    PLAN_DELTA = "plan_delta",
    PLAN_END = "plan_end",
    STATE_CHANGE = "state_change",
    TOOL_CALL = "tool_call",
    TOOL_RES = "tool_res",
    ERROR = "error",
    DONE = "done"
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
export declare function resetCounter(mid?: string): void;
export declare function buildSegment(cid: string, mid: string, segmentType: SegmentType, payload?: string, meta?: Record<string, unknown>): Segment;
export declare function createContentBlock(type: SegmentType, content?: string, metadata?: Record<string, unknown>): ContentBlock;
export declare function createMessage(role: string, messageId: string, conversationId: string, sessionId: string, workspaceId: string, contentBlocks?: ContentBlock[], content?: string, metadata?: Record<string, unknown>): Message;
export declare function messageToDict(message: Message): Record<string, unknown>;
//# sourceMappingURL=canonical.d.ts.map