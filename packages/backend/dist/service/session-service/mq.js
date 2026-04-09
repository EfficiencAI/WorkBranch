"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageQueue = void 0;
class MessageQueue {
    subscribers = new Map();
    messageHistory = new Map();
    maxHistorySize = 100;
    subscribe(conversationId, callback) {
        if (!this.subscribers.has(conversationId)) {
            this.subscribers.set(conversationId, new Set());
        }
        this.subscribers.get(conversationId).add(callback);
        return () => {
            this.subscribers.get(conversationId)?.delete(callback);
            if (this.subscribers.get(conversationId)?.size === 0) {
                this.subscribers.delete(conversationId);
            }
        };
    }
    publish(message) {
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
                }
                catch (err) {
                    console.error('[MQ] Error in subscriber callback:', err);
                }
            });
        }
    }
    publishSync(message) {
        this.publish(message);
    }
    getHistory(conversationId) {
        return this.messageHistory.get(conversationId) || [];
    }
    clearHistory(conversationId) {
        this.messageHistory.delete(conversationId);
    }
    clear(conversationId) {
        this.subscribers.delete(conversationId);
        this.messageHistory.delete(conversationId);
    }
}
exports.messageQueue = new MessageQueue();
//# sourceMappingURL=mq.js.map