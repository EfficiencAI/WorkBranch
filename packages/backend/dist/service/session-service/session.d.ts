export declare enum ConversationState {
    PENDING = "pending",
    RUNNING = "running",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
export declare class SessionService {
    private conversations;
    createSession(title?: string): import("../../data").Session;
    deleteSession(sessionId: number): boolean;
    listSessions(): import("../../data").Session[];
    getSession(sessionId: number): import("../../data").Session | null;
    createConversation(sessionId: number, workspaceId?: string, parentConversationId?: string): Promise<{
        conversation_id: string;
        session_id: number;
        parent_conversation_id: string | null;
    }>;
    sendMessage(conversationId: string, message: string, _enableContext?: boolean): Promise<{
        message_id: string;
        conversation_id: string;
        session_id: number;
    }>;
    endConversation(conversationId: string): Promise<number>;
    cancelConversation(conversationId: string): Promise<boolean>;
    deleteConversation(conversationId: string): Promise<boolean>;
    cascadeDeleteConversation(conversationId: string): Promise<boolean>;
    getPersistedConversation(conversationId: string): import("../../data").Conversation | null;
    updateConversationPositions(sessionId: number, positions: Array<{
        conversation_id: string;
        x: number;
        y: number;
    }>): Promise<void>;
    listConversationSummaries(sessionId: number): Promise<Array<Record<string, unknown>>>;
    getConversationDetail(conversationId: string): Promise<Record<string, unknown> | null>;
    getConversationMessages(conversationId: string): Promise<Array<Record<string, unknown>>>;
    getParentChainMessages(conversationId: string): Promise<Array<Record<string, unknown>>>;
    getContextInfo(conversationId: string): Promise<Record<string, unknown>>;
    private generateMessageId;
    private generateConversationId;
}
export declare const sessionService: SessionService;
//# sourceMappingURL=session.d.ts.map