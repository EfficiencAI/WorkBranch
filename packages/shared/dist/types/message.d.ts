export declare enum SegmentType {
    THINKING_START = "thinking_start",
    THINKING_DELTA = "thinking_delta",
    THINKING_END = "thinking_end",
    TEXT_START = "text_start",
    TEXT_DELTA = "text_delta",
    TEXT_END = "text_end",
    ERROR_START = "error_start",
    ERROR_DELTA = "error_delta",
    ERROR_END = "error_end",
    TOOL_CALL_START = "tool_call_start",
    TOOL_CALL_DELTA = "tool_call_delta",
    TOOL_CALL_END = "tool_call_end",
    TOOL_RES_START = "tool_res_start",
    TOOL_RES_DELTA = "tool_res_delta",
    TOOL_RES_END = "tool_res_end",
    PLAN_START = "plan_start",
    PLAN_DELTA = "plan_delta",
    PLAN_END = "plan_end",
    STATE_CHANGE = "state_change"
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
//# sourceMappingURL=message.d.ts.map