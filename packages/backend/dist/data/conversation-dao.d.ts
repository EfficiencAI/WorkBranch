export interface Session {
    id: number;
    user_id: number | null;
    title: string;
    created_at: string;
    updated_at: string;
}
export interface Conversation {
    id: string;
    session_id: number;
    workspace_id: string | null;
    parent_conversation_id: string | null;
    title: string | null;
    state: string | null;
    created_at: string;
    updated_at: string;
    ended_at: string | null;
    message_count: number;
    error: string | null;
    position_x: number | null;
    position_y: number | null;
}
export interface Message {
    id: string;
    conversation_id: string;
    session_id: number;
    user_content: string;
    assistant_content: string | null;
    thinking_content: string | null;
    status: string;
    created_at: string;
    updated_at: string;
}
export declare class ConversationDAO {
    createSession(userId: number, title: string): number;
    deleteSession(sessionId: number): void;
    createConversation(conversationId: string, sessionId: number, workspaceId: string | null, state: string, parentConversationId?: string | null, title?: string | null): void;
    updateConversation(conversationId: string, options: {
        workspace_id?: string | null;
        parent_conversation_id?: string | null;
        title?: string | null;
        state?: string | null;
        message_count?: number;
        error?: string | null;
        ended_at?: string | null;
        position_x?: number | null;
        position_y?: number | null;
    }): void;
    getConversationById(conversationId: string): Conversation | null;
    listConversationsBySession(sessionId: number): Conversation[];
    updateConversationPositions(sessionId: number, positions: Array<{
        conversation_id: string;
        x: number;
        y: number;
    }>): void;
    deleteConversation(conversationId: string): void;
    listDescendantConversationIds(conversationId: string): string[];
    clearChildConversationParents(conversationId: string): void;
    createMessage(messageId: string, conversationId: string, sessionId: number, userContent: string, status?: string): void;
    updateMessageAssistant(messageId: string, assistantContent: string, status?: string, thinkingContent?: string | null): void;
    updateMessageStatus(messageId: string, status: string): void;
    getMessageById(messageId: string): Message | null;
    getMessagesByConversation(conversationId: string): Message[];
    getMessagesBySession(sessionId: number): Message[];
    deleteMessagesByConversation(conversationId: string): void;
    deleteMessagesByConversations(conversationIds: string[]): void;
    deleteConversations(conversationIds: string[]): void;
    getSessionById(sessionId: number): Session | null;
    getParentChainConversationIds(conversationId: string): string[];
    getParentChainMessages(conversationId: string): Message[];
    private syncConversationMessageCount;
    private updateSessionUpdatedAt;
    private rowToSession;
    private rowToConversation;
    private rowToMessage;
}
export declare const conversationDAO: ConversationDAO;
//# sourceMappingURL=conversation-dao.d.ts.map