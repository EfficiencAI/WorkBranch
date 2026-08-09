import { conversationDAO } from '../../data';
import { conversationBuffer } from './conversation-buffer';
import { messageQueue } from './mq';
import { createContentBlock, createMessage, SegmentType } from './canonical';
import { agentService } from '../agent-service/agent';
import type { AgentId } from '../agent-service/adapters';
import { workspaceService } from '../agent-service/service/workspace-service';
import { logger } from '../../core/logging';
import { assertContextMessagesDisjoint, toAgentContextMessages } from './agent-context';

export enum ConversationState {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

interface ConversationInfo {
  conversation_id: string;
  session_id: number;
  workspace_id: string;
  parent_conversation_id: string | null;
  title: string | null;
  state: ConversationState;
  created_at: Date;
  error: string | null;
  message_count: number;
}

export class SessionService {
  private conversations: Map<string, ConversationInfo> = new Map();

  createSession(title: string = '新会话') {
    const userId = 1;
    const workspaceId = this.generateWorkspaceId();
    const sessionId = conversationDAO.createSession(userId, title, workspaceId);
    workspaceService.register(workspaceId, String(sessionId));
    const session = conversationDAO.getSessionById(sessionId);
    if (!session) {
      console.error('[SessionService] getSessionById returned null after createSession, sessionId:', sessionId);
      return {
        id: sessionId,
        user_id: userId,
        title,
        workspace_id: workspaceId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return session;
  }

  private generateWorkspaceId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `ws-${timestamp}-${random}`;
  }

  deleteSession(sessionId: number): boolean {
    const conversations = conversationDAO.listConversationsBySession(sessionId);
    for (const conv of conversations) {
      this.deleteConversation(conv.id);
    }
    conversationDAO.deleteSession(sessionId);
    return true;
  }

  listSessions() {
    const user = { id: 1 };
    return conversationDAO.listSessionsByUserId(user.id);
  }

  getSession(sessionId: number) {
    return conversationDAO.getSessionById(sessionId);
  }

  async createConversation(
    sessionId: number,
    parentConversationId?: string
  ): Promise<{ conversation_id: string; session_id: number; parent_conversation_id: string | null }> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (parentConversationId) {
      const parentConv = conversationDAO.getConversationById(parentConversationId);
      if (!parentConv) {
        throw new Error(`Conversation ${parentConversationId} not found`);
      }
      if (parentConv.session_id !== sessionId) {
        throw new Error('Parent conversation does not belong to this session');
      }
    }

    const conversationId = this.generateConversationId();
    const workspaceId = session.workspace_id || conversationId;

    if (session.workspace_id) {
      workspaceService.register(session.workspace_id, String(sessionId));
    }

    conversationDAO.createConversation(
      conversationId,
      sessionId,
      workspaceId,
      ConversationState.PENDING,
      parentConversationId || null
    );

    this.conversations.set(conversationId, {
      conversation_id: conversationId,
      session_id: sessionId,
      workspace_id: workspaceId,
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

  async sendMessage(
    conversationId: string,
    message: string,
    enableContext: boolean = false,
    agentId?: AgentId,
    writeConfirmed: boolean = false,
  ): Promise<{ message_id: string; conversation_id: string; session_id: number }> {
    let convInfo = this.conversations.get(conversationId);
    if (!convInfo) {
      const persisted = conversationDAO.getConversationById(conversationId);
      if (!persisted) {
        throw new Error(`Conversation ${conversationId} not found`);
      }
      convInfo = {
        conversation_id: persisted.id,
        session_id: persisted.session_id,
        workspace_id: persisted.workspace_id || conversationId,
        parent_conversation_id: persisted.parent_conversation_id,
        title: persisted.title,
        state: (persisted.state as ConversationState) || ConversationState.PENDING,
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
    const storedParentChainMessages = enableContext
      ? conversationDAO.getParentChainMessages(conversationId)
      : [];
    const storedCurrentConversationMessages = enableContext
      ? conversationDAO.getMessagesByConversation(conversationId)
      : [];
    assertContextMessagesDisjoint(storedParentChainMessages, storedCurrentConversationMessages);
    const parentChainMessages = toAgentContextMessages(storedParentChainMessages);
    const currentConversationMessages = toAgentContextMessages(storedCurrentConversationMessages);

    await conversationBuffer.createMessage(messageId, conversationId, convInfo.session_id, message);

    convInfo.state = ConversationState.RUNNING;
    convInfo.message_count++;
    conversationDAO.updateConversation(conversationId, {
      state: ConversationState.RUNNING,
      message_count: convInfo.message_count,
      error: null,
    });

    setImmediate(() => {
      agentService.runAgent(
        convInfo!.workspace_id,
        conversationId,
        String(convInfo!.session_id),
        messageId,
        message,
        parentChainMessages,
        currentConversationMessages,
        agentId,
        writeConfirmed,
      ).catch(async (err) => {
        const errorMsg = String(err);
        logger.error({ err: errorMsg, conversationId }, 'Agent run failed');
        try {
          await this.failConversation(conversationId, errorMsg);
        } catch (cleanupErr) {
          logger.error({ err: cleanupErr, conversationId }, 'Failed to mark conversation as failed');
        }
      });
    });

    return {
      message_id: messageId,
      conversation_id: conversationId,
      session_id: convInfo.session_id,
    };
  }

  async endConversation(conversationId: string): Promise<number> {
    const convInfo = this.conversations.get(conversationId);
    if (!convInfo) {
      const persisted = conversationDAO.getConversationById(conversationId);
      if (!persisted) return 0;
    }

    const messages = conversationDAO.getMessagesByConversation(conversationId);
    const actualCount = messages.length;

    if (convInfo) {
      convInfo.state = ConversationState.COMPLETED;
      conversationDAO.updateConversation(conversationId, {
        state: ConversationState.COMPLETED,
        message_count: actualCount,
        ended_at: new Date().toISOString(),
      });
    }

    return actualCount;
  }

  async cancelConversation(conversationId: string): Promise<boolean> {
    logger.info({ conversationId }, 'Cancelling conversation');
    const convInfo = this.conversations.get(conversationId);
    if (!convInfo) {
      const persisted = conversationDAO.getConversationById(conversationId);
      if (!persisted) {
        logger.info({ conversationId }, 'Conversation not found in memory or DB, skip cancel');
        return false;
      }
    }

    if (convInfo) {
      convInfo.state = ConversationState.CANCELLED;
      conversationDAO.updateConversation(conversationId, {
        state: ConversationState.CANCELLED,
        ended_at: new Date().toISOString(),
      });
      logger.info({ conversationId, state: ConversationState.CANCELLED }, 'Conversation state updated');
    }

    try {
      await agentService.cancelConversation(conversationId);
    } catch (cancelErr) {
      logger.error({ err: cancelErr, conversationId }, 'Failed to cancel active agent process');
    }

    await this.finalizeInFlightMessages(conversationId, '运行已取消');
    conversationBuffer.clear(conversationId);
    return true;
  }

  async failConversation(conversationId: string, error: string): Promise<void> {
    const convInfo = this.conversations.get(conversationId);
    if (!convInfo) {
      const persisted = conversationDAO.getConversationById(conversationId);
      if (!persisted) return;
    }

    await this.finalizeInFlightMessages(conversationId, error);

    if (convInfo) {
      convInfo.state = ConversationState.FAILED;
      convInfo.error = error;
      conversationDAO.updateConversation(conversationId, {
        state: ConversationState.FAILED,
        error: error,
        ended_at: new Date().toISOString(),
      });
    }
  }

  private async finalizeInFlightMessages(conversationId: string, error: string): Promise<void> {
    const drafts = conversationBuffer.getDraftsByConversation(conversationId);
    const convInfo = this.conversations.get(conversationId);
    for (const draft of drafts) {
      const baseMeta = { message_id: draft.id };
      await messageQueue.publish(createMessage(
        'assistant',
        draft.id,
        conversationId,
        String(draft.session_id),
        convInfo?.workspace_id ?? draft.conversation_id,
        [createContentBlock(SegmentType.ERROR, error, baseMeta)],
        error
      ));
      await messageQueue.publish(createMessage(
        'assistant',
        draft.id,
        conversationId,
        String(draft.session_id),
        convInfo?.workspace_id ?? draft.conversation_id,
        [createContentBlock(SegmentType.DONE, '', baseMeta)],
        ''
      ));
    }
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const persisted = conversationDAO.getConversationById(conversationId);
    if (!persisted && !this.conversations.has(conversationId)) {
      return false;
    }

    conversationDAO.clearChildConversationParents(conversationId);

    for (const [, info] of this.conversations) {
      if (info.parent_conversation_id === conversationId) {
        info.parent_conversation_id = null;
      }
    }

    conversationBuffer.clear(conversationId);
    conversationDAO.deleteMessagesByConversation(conversationId);
    conversationDAO.deleteConversation(conversationId);
    this.conversations.delete(conversationId);

    return true;
  }

  async cascadeDeleteConversation(conversationId: string): Promise<boolean> {
    const persisted = conversationDAO.getConversationById(conversationId);
    if (!persisted && !this.conversations.has(conversationId)) {
      return false;
    }

    const subtreeIds = [conversationId, ...conversationDAO.listDescendantConversationIds(conversationId)];
    let deletedAny = false;

    for (const targetId of subtreeIds.reverse()) {
      deletedAny = (await this.deleteConversation(targetId)) || deletedAny;
    }

    return deletedAny;
  }

  getPersistedConversation(conversationId: string) {
    return conversationDAO.getConversationById(conversationId);
  }

  async updateConversationPositions(
    sessionId: number,
    positions: Array<{ conversation_id: string; x: number; y: number }>
  ): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    conversationDAO.updateConversationPositions(sessionId, positions);
  }

  async listConversationSummaries(sessionId: number): Promise<Array<Record<string, unknown>>> {
    const conversations = conversationDAO.listConversationSummariesBySession(sessionId);
    return conversations.map((conv) => ({
      conversation_id: conv.id,
      parent_conversation_id: conv.parent_conversation_id,
      title: conv.title,
      state: conv.state,
      message_count: conv.message_count,
      user_prompt_preview: conv.user_prompt_preview,
      assistant_conclusion_preview: conv.assistant_conclusion_preview,
      created_at: conv.created_at,
      updated_at: conv.updated_at,
      position_x: conv.position_x,
      position_y: conv.position_y,
    }));
  }

  async getConversationDetail(conversationId: string): Promise<Record<string, unknown> | null> {
    const persisted = conversationDAO.getConversationById(conversationId);
    const runtime = this.conversations.get(conversationId);

    if (!persisted && !runtime) return null;

    const messages = conversationDAO.getMessagesByConversation(conversationId);
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

  async getConversationMessages(conversationId: string): Promise<Array<Record<string, unknown>>> {
    const messages = conversationDAO.getMessagesByConversation(conversationId);
    return messages.map((msg) => ({
      id: msg.id,
      conversation_id: msg.conversation_id,
      session_id: msg.session_id,
      user_content: msg.user_content,
      assistant_content: msg.assistant_content,
      thinking_content: msg.thinking_content,
      content_blocks: msg.content_blocks,
      status: msg.status,
      created_at: msg.created_at,
      updated_at: msg.updated_at,
    }));
  }

  async getParentChainMessages(conversationId: string): Promise<Array<Record<string, unknown>>> {
    const messages = conversationDAO.getParentChainMessages(conversationId);
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

  async getContextInfo(conversationId: string): Promise<Record<string, unknown>> {
    const messages = await this.getParentChainMessages(conversationId);
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += (msg.user_content as string)?.length || 0;
      totalChars += (msg.assistant_content as string)?.length || 0;
    }
    const estimatedTokens = Math.floor(totalChars / 4);
    return {
      conversation_id: conversationId,
      message_count: messages.length,
      total_chars: totalChars,
      estimated_tokens: estimatedTokens,
    };
  }

  async recoverStaleConversations(): Promise<number> {
    const staleConvs = conversationDAO.findConversationsByState(ConversationState.RUNNING);
    let recovered = 0;

    for (const conv of staleConvs) {
      logger.info({ conversationId: conv.id, sessionId: conv.session_id }, 'Recovering stale running conversation');
      conversationDAO.updateConversation(conv.id, {
        state: ConversationState.FAILED,
        error: 'Recovered from stale state on startup',
        ended_at: new Date().toISOString(),
      });
      recovered++;
    }

    if (recovered > 0) {
      logger.info({ recovered }, 'Recovered stale running conversations');
    }

    const fixedMessages = conversationDAO.updateMessagesStatusByStatus('streaming', 'failed');
    if (fixedMessages > 0) {
      logger.info({ fixedMessages }, 'Fixed stale streaming messages to failed');
    }

    return recovered;
  }

  private generateMessageId(conversationId: string): string {
    const timestamp = Date.now();
    return `msg-${conversationId}-${timestamp}`;
  }

  private generateConversationId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `conv-${timestamp}-${random}`;
  }
}

export const sessionService = new SessionService();
