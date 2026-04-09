"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.conversationBuffer = void 0;
const data_1 = require("../../data");
class ConversationBuffer {
    drafts = new Map();
    async createMessage(messageId, conversationId, sessionId, userContent) {
        const draft = {
            id: messageId,
            conversation_id: conversationId,
            session_id: sessionId,
            user_content: userContent,
            assistant_content: null,
            thinking_content: null,
            status: 'streaming',
            created_at: new Date().toISOString(),
        };
        this.drafts.set(messageId, draft);
        data_1.conversationDAO.createMessage(messageId, conversationId, sessionId, userContent, 'streaming');
    }
    hasDraft(messageId) {
        return this.drafts.has(messageId);
    }
    getDraft(messageId) {
        return this.drafts.get(messageId);
    }
    async appendContent(messageId, content, isThinking = false) {
        const draft = this.drafts.get(messageId);
        if (!draft)
            return;
        if (isThinking) {
            draft.thinking_content = (draft.thinking_content || '') + content;
        }
        else {
            draft.assistant_content = (draft.assistant_content || '') + content;
        }
    }
    async completeMessage(messageId) {
        const draft = this.drafts.get(messageId);
        if (!draft)
            return;
        data_1.conversationDAO.updateMessageAssistant(messageId, draft.assistant_content || '', 'completed', draft.thinking_content);
        this.drafts.delete(messageId);
    }
    async failMessage(messageId) {
        const draft = this.drafts.get(messageId);
        if (!draft)
            return;
        data_1.conversationDAO.updateMessageStatus(messageId, 'failed');
        this.drafts.delete(messageId);
    }
    async consumeMessage(message) {
        const draft = this.drafts.get(message.message_id);
        if (!draft)
            return;
        for (const block of message.content_blocks) {
            if (block.type === 'text_delta') {
                draft.assistant_content = (draft.assistant_content || '') + block.content;
            }
            else if (block.type === 'thinking_delta') {
                draft.thinking_content = (draft.thinking_content || '') + block.content;
            }
        }
    }
    clear(conversationId) {
        for (const [id, draft] of this.drafts) {
            if (draft.conversation_id === conversationId) {
                this.drafts.delete(id);
            }
        }
    }
}
exports.conversationBuffer = new ConversationBuffer();
//# sourceMappingURL=conversation-buffer.js.map