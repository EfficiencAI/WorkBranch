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
    meta?: Record<string, unknown>;
}
export interface Message {
    id: string;
    conversationId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: number;
}
export interface ContentBlock {
    type: SegmentType;
    content: string;
    metadata?: Record<string, unknown>;
}
export interface CanonicalMessage {
    role: string;
    message_id: string;
    conversation_id: string;
    session_id: string;
    workspace_id: string;
    content_blocks: ContentBlock[];
    content: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}
export type MessageNodeId = string;
export type MessageNodeStatus = 'streaming' | 'completed' | 'error';
export interface MessageNode {
    id: MessageNodeId;
    conversationId: string;
    userContent: string;
    assistantContent: string;
    status: MessageNodeStatus;
    createdAt?: string;
    updatedAt?: string;
}
export type ConversationState = 'idle' | 'generating' | 'done' | 'error';
//# sourceMappingURL=message.d.ts.map