"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionService = exports.SessionService = exports.ConversationState = void 0;
const data_1 = require("../../data");
const conversation_buffer_1 = require("./conversation-buffer");
var ConversationState;
(function (ConversationState) {
    ConversationState["PENDING"] = "pending";
    ConversationState["RUNNING"] = "running";
    ConversationState["COMPLETED"] = "completed";
    ConversationState["FAILED"] = "failed";
    ConversationState["CANCELLED"] = "cancelled";
})(ConversationState || (exports.ConversationState = ConversationState = {}));
class SessionService {
    conversations = new Map();
    createSession(title = '新会话') {
        const userId = 1;
        const sessionId = data_1.conversationDAO.createSession(userId, title);
        return data_1.conversationDAO.getSessionById(sessionId);
    }
    deleteSession(sessionId) {
        const conversations = data_1.conversationDAO.listConversationsBySession(sessionId);
        for (const conv of conversations) {
            this.deleteConversation(conv.id);
        }
        data_1.conversationDAO.deleteSession(sessionId);
        return true;
    }
    listSessions() {
        const user = { id: 1 };
        return data_1.conversationDAO.getSessionById(user.id) ? [data_1.conversationDAO.getSessionById(user.id)] : [];
    }
    getSession(sessionId) {
        return data_1.conversationDAO.getSessionById(sessionId);
    }
    async createConversation(sessionId, workspaceId, parentConversationId) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        if (parentConversationId) {
            const parentConv = data_1.conversationDAO.getConversationById(parentConversationId);
            if (!parentConv) {
                throw new Error(`Conversation ${parentConversationId} not found`);
            }
            if (parentConv.session_id !== sessionId) {
                throw new Error('Parent conversation does not belong to this session');
            }
        }
        const conversationId = this.generateConversationId();
        const resolvedWorkspaceId = workspaceId || conversationId;
        data_1.conversationDAO.createConversation(conversationId, sessionId, resolvedWorkspaceId, ConversationState.PENDING, parentConversationId || null);
        this.conversations.set(conversationId, {
            conversation_id: conversationId,
            session_id: sessionId,
            workspace_id: resolvedWorkspaceId,
            parent_conversation_id: parentConversationId || null,
            title: null,
            state: ConversationState.PENDING,
            created_at: new Date(),
            error: null,
            message_count: 0,
        });
        return {
            conversation_id: conversationId,
            session_id: sessionId,
            parent_conversation_id: parentConversationId || null,
        };
    }
    async sendMessage(conversationId, message, _enableContext = false) {
        let convInfo = this.conversations.get(conversationId);
        if (!convInfo) {
            const persisted = data_1.conversationDAO.getConversationById(conversationId);
            if (!persisted) {
                throw new Error(`Conversation ${conversationId} not found`);
            }
            convInfo = {
                conversation_id: persisted.id,
                session_id: persisted.session_id,
                workspace_id: persisted.workspace_id || conversationId,
                parent_conversation_id: persisted.parent_conversation_id,
                title: persisted.title,
                state: persisted.state || ConversationState.PENDING,
                created_at: new Date(persisted.created_at),
                error: persisted.error,
                message_count: persisted.message_count,
            };
            this.conversations.set(conversationId, convInfo);
        }
        if (convInfo.state === ConversationState.RUNNING) {
            throw new Error(`Conversation ${conversationId} is already running`);
        }
        const messageId = this.generateMessageId(conversationId);
        await conversation_buffer_1.conversationBuffer.createMessage(messageId, conversationId, convInfo.session_id, message);
        convInfo.state = ConversationState.RUNNING;
        convInfo.message_count++;
        data_1.conversationDAO.updateConversation(conversationId, {
            state: ConversationState.RUNNING,
            message_count: convInfo.message_count,
            error: null,
        });
        return {
            message_id: messageId,
            conversation_id: conversationId,
            session_id: convInfo.session_id,
        };
    }
    async endConversation(conversationId) {
        const convInfo = this.conversations.get(conversationId);
        if (!convInfo) {
            const persisted = data_1.conversationDAO.getConversationById(conversationId);
            if (!persisted)
                return 0;
        }
        const messages = data_1.conversationDAO.getMessagesByConversation(conversationId);
        const actualCount = messages.length;
        if (convInfo) {
            convInfo.state = ConversationState.COMPLETED;
            data_1.conversationDAO.updateConversation(conversationId, {
                state: ConversationState.COMPLETED,
                message_count: actualCount,
                ended_at: new Date().toISOString(),
            });
        }
        return actualCount;
    }
    async cancelConversation(conversationId) {
        const convInfo = this.conversations.get(conversationId);
        if (!convInfo) {
            const persisted = data_1.conversationDAO.getConversationById(conversationId);
            if (!persisted)
                return false;
        }
        if (convInfo) {
            convInfo.state = ConversationState.CANCELLED;
            data_1.conversationDAO.updateConversation(conversationId, {
                state: ConversationState.CANCELLED,
                ended_at: new Date().toISOString(),
            });
        }
        conversation_buffer_1.conversationBuffer.clear(conversationId);
        return true;
    }
    async deleteConversation(conversationId) {
        const persisted = data_1.conversationDAO.getConversationById(conversationId);
        if (!persisted && !this.conversations.has(conversationId)) {
            return false;
        }
        data_1.conversationDAO.clearChildConversationParents(conversationId);
        for (const [, info] of this.conversations) {
            if (info.parent_conversation_id === conversationId) {
                info.parent_conversation_id = null;
            }
        }
        conversation_buffer_1.conversationBuffer.clear(conversationId);
        data_1.conversationDAO.deleteMessagesByConversation(conversationId);
        data_1.conversationDAO.deleteConversation(conversationId);
        this.conversations.delete(conversationId);
        return true;
    }
    async cascadeDeleteConversation(conversationId) {
        const persisted = data_1.conversationDAO.getConversationById(conversationId);
        if (!persisted && !this.conversations.has(conversationId)) {
            return false;
        }
        const subtreeIds = [conversationId, ...data_1.conversationDAO.listDescendantConversationIds(conversationId)];
        let deletedAny = false;
        for (const targetId of subtreeIds.reverse()) {
            deletedAny = (await this.deleteConversation(targetId)) || deletedAny;
        }
        return deletedAny;
    }
    getPersistedConversation(conversationId) {
        return data_1.conversationDAO.getConversationById(conversationId);
    }
    async updateConversationPositions(sessionId, positions) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        data_1.conversationDAO.updateConversationPositions(sessionId, positions);
    }
    async listConversationSummaries(sessionId) {
        const conversations = data_1.conversationDAO.listConversationsBySession(sessionId);
        return conversations.map((conv) => ({
            conversation_id: conv.id,
            parent_conversation_id: conv.parent_conversation_id,
            title: conv.title,
            state: conv.state,
            message_count: conv.message_count,
            created_at: conv.created_at,
            updated_at: conv.updated_at,
            position_x: conv.position_x,
            position_y: conv.position_y,
        }));
    }
    async getConversationDetail(conversationId) {
        const persisted = data_1.conversationDAO.getConversationById(conversationId);
        const runtime = this.conversations.get(conversationId);
        if (!persisted && !runtime)
            return null;
        const messages = data_1.conversationDAO.getMessagesByConversation(conversationId);
        const actualMessageCount = messages.length;
        if (persisted) {
            return {
                conversation_id: persisted.id,
                session_id: persisted.session_id,
                workspace_id: persisted.workspace_id,
                parent_conversation_id: persisted.parent_conversation_id,
                title: persisted.title,
                state: persisted.state,
                created_at: persisted.created_at,
                updated_at: persisted.updated_at,
                ended_at: persisted.ended_at,
                message_count: actualMessageCount,
                error: persisted.error,
                position_x: persisted.position_x,
                position_y: persisted.position_y,
            };
        }
        return null;
    }
    async getConversationMessages(conversationId) {
        const messages = data_1.conversationDAO.getMessagesByConversation(conversationId);
        return messages.map((msg) => ({
            id: msg.id,
            conversation_id: msg.conversation_id,
            session_id: msg.session_id,
            user_content: msg.user_content,
            assistant_content: msg.assistant_content,
            thinking_content: msg.thinking_content,
            status: msg.status,
            created_at: msg.created_at,
            updated_at: msg.updated_at,
        }));
    }
    async getParentChainMessages(conversationId) {
        const messages = data_1.conversationDAO.getParentChainMessages(conversationId);
        return messages.map((msg) => ({
            id: msg.id,
            conversation_id: msg.conversation_id,
            session_id: msg.session_id,
            user_content: msg.user_content,
            assistant_content: msg.assistant_content,
            status: msg.status,
            created_at: msg.created_at,
            updated_at: msg.updated_at,
        }));
    }
    async getContextInfo(conversationId) {
        const messages = await this.getParentChainMessages(conversationId);
        let totalChars = 0;
        for (const msg of messages) {
            totalChars += msg.user_content?.length || 0;
            totalChars += msg.assistant_content?.length || 0;
        }
        const estimatedTokens = Math.floor(totalChars / 4);
        return {
            conversation_id: conversationId,
            message_count: messages.length,
            total_chars: totalChars,
            estimated_tokens: estimatedTokens,
        };
    }
    generateMessageId(conversationId) {
        const timestamp = Date.now();
        return `msg-${conversationId}-${timestamp}`;
    }
    generateConversationId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `conv-${timestamp}-${random}`;
    }
}
exports.SessionService = SessionService;
exports.sessionService = new SessionService();
//# sourceMappingURL=session.js.map