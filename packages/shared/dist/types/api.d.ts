export interface ApiResult<T = unknown> {
    code: number;
    message: string;
    data: T | null;
}
export interface SendMessageRequest {
    message: string;
    enable_context?: boolean;
}
export interface SendMessageResponse {
    message_id: string;
    conversation_id: string;
    session_id: number;
}
export interface UpdatePositionsRequest {
    positions: Array<{
        conversation_id: string;
        x: number;
        y: number;
    }>;
}
export interface CreateConversationRequest {
    workspace_id?: string;
    parent_conversation_id?: string;
}
export interface CreateConversationResponse {
    conversation_id: string;
    session_id: number;
    parent_conversation_id: string | null;
}
//# sourceMappingURL=api.d.ts.map