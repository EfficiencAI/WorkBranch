import { Message } from './canonical';

type MessageCallback = (message: Message) => void;

class MessageQueue {
  private subscribers: Map<string, Set<MessageCallback>> = new Map();
  private messageHistory: Map<string, Message[]> = new Map();
  private maxHistorySize = 100;

  subscribe(conversationId: string, callback: MessageCallback): () => void {
    if (!this.subscribers.has(conversationId)) {
      this.subscribers.set(conversationId, new Set());
    }
    this.subscribers.get(conversationId)!.add(callback);

    return () => {
      this.subscribers.get(conversationId)?.delete(callback);
      if (this.subscribers.get(conversationId)?.size === 0) {
        this.subscribers.delete(conversationId);
      }
    };
  }

  publish(message: Message): void {
    const history = this.messageHistory.get(message.conversation_id) || [];
    history.push(message);
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
    this.messageHistory.set(message.conversation_id, history);

    const callbacks = this.subscribers.get(message.conversation_id);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(message);
        } catch (err) {
          console.error('[MQ] Error in subscriber callback:', err);
        }
      });
    }
  }

  publishSync(message: Message): void {
    this.publish(message);
  }

  getHistory(conversationId: string): Message[] {
    return this.messageHistory.get(conversationId) || [];
  }

  clearHistory(conversationId: string): void {
    this.messageHistory.delete(conversationId);
  }

  clear(conversationId: string): void {
    this.subscribers.delete(conversationId);
    this.messageHistory.delete(conversationId);
  }
}

export const messageQueue = new MessageQueue();
