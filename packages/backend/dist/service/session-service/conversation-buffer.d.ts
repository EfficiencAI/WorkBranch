interface DraftMessage {
    id: string;
    conversation_id: string;
    session_id: number;
    user_content: string;
    assistant_content: string | null;
    thinking_content: string | null;
    status: string;
    created_at: string;
}
declare class ConversationBuffer {
    private drafts;
    createMessage(messageId: string, conversationId: string, sessionId: number, userContent: string): Promise<void>;
    hasDraft(messageId: string): boolean;
    getDraft(messageId: string): DraftMessage | undefined;
    appendContent(messageId: string, content: string, isThinking?: boolean): Promise<void>;
    completeMessage(messageId: string): Promise<void>;
    failMessage(messageId: string): Promise<void>;
    consumeMessage(message: import('./canonical').Message): Promise<void>;
    clear(conversationId: string): void;
}
export declare const conversationBuffer: ConversationBuffer;
export {};
//# sourceMappingURL=conversation-buffer.d.ts.map