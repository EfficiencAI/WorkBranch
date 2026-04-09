import { Message } from './canonical';
type MessageCallback = (message: Message) => void;
declare class MessageQueue {
    private subscribers;
    private messageHistory;
    private maxHistorySize;
    subscribe(conversationId: string, callback: MessageCallback): () => void;
    publish(message: Message): void;
    publishSync(message: Message): void;
    getHistory(conversationId: string): Message[];
    clearHistory(conversationId: string): void;
    clear(conversationId: string): void;
}
export declare const messageQueue: MessageQueue;
export {};
//# sourceMappingURL=mq.d.ts.map