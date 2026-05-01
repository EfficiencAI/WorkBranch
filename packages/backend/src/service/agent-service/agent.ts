import { messageQueue } from '../session-service/mq';
import { createMessage, createContentBlock, SegmentType, type ContentBlock } from '../session-service/canonical';
import { logger } from '../../core/logging';
import { runAgentGraph, type AgentOutcome } from './graph/agent-graphs';
import type { MessageContext } from './graph/director-agent/director-agent';
import { initializeTools } from './tools';
import { sessionService } from '../session-service';
import { workspaceService } from './service/workspace-service';

enum ConversationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

interface Conversation {
  id: string;
  workspace_id: string;
  session_id: string;
  status: ConversationStatus;
  created_at: Date;
  messages: Array<Record<string, unknown>>;
  error: string | null;
}

export class AgentService {
  private initialized = false;
  private conversations: Map<string, Conversation> = new Map();

  private initialize(): void {
    if (!this.initialized) {
      initializeTools();
      this.initialized = true;
    }
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  async createConversation(
    workspaceId?: string,
    sessionId?: string,
  ): Promise<string> {
    this.initialize();

    const convId = this.generateId();
    const sid = sessionId || this.generateId();
    const wid = workspaceId || convId;

    workspaceService.register(wid, sid);

    this.conversations.set(convId, {
      id: convId,
      workspace_id: wid,
      session_id: sid,
      status: ConversationStatus.PENDING,
      created_at: new Date(),
      messages: [],
      error: null,
    });

    logger.info({
      event: 'conversation.created',
      conversation_id: convId,
      workspace_id: wid,
      session_id: sid,
    });

    return convId;
  }

  async registerConversation(
    conversationId: string,
    workspaceId: string,
    sessionId: string,
  ): Promise<void> {
    this.initialize();

    workspaceService.register(workspaceId, sessionId);

    this.conversations.set(conversationId, {
      id: conversationId,
      workspace_id: workspaceId,
      session_id: sessionId,
      status: ConversationStatus.PENDING,
      created_at: new Date(),
      messages: [],
      error: null,
    });

    logger.info({
      event: 'conversation.registered',
      conversation_id: conversationId,
      workspace_id: workspaceId,
      session_id: sessionId,
    });
  }

  async cancelConversation(conversationId: string): Promise<boolean> {
    const conv = this.conversations.get(conversationId);
    if (!conv) return false;

    conv.status = ConversationStatus.CANCELLED;
    logger.info({
      event: 'conversation.cancelled',
      conversation_id: conversationId,
    });
    return true;
  }

  private cancelCheck(conversationId: string): void {
    const conv = this.conversations.get(conversationId);
    if (conv && conv.status === ConversationStatus.CANCELLED) {
      throw new Error('对话已被取消');
    }
  }

  async sendMessage(
    conversationId: string,
    userMessage: string,
    messageId?: string,
    parentChainMessages?: Array<Record<string, unknown>>,
    currentConversationMessages?: Array<Record<string, unknown>>,
    handoffMetadata?: Record<string, unknown>,
  ): Promise<void> {
    this.initialize();

    const conv = this.conversations.get(conversationId);
    if (!conv) {
      throw new Error(`对话 ${conversationId} 不存在`);
    }

    conv.messages.push({ role: 'user', content: userMessage });
    conv.status = ConversationStatus.RUNNING;

    const mid = messageId || this.generateId();

    logger.info({
      event: 'agent.run.started',
      conversation_id: conversationId,
      workspace_id: conv.workspace_id,
      message_id: mid,
      parent_chain_count: parentChainMessages?.length || 0,
      current_conv_count: currentConversationMessages?.length || 0,
    });

    let textStarted = false;

    const sendMessage = async (content: string = '', blockType: SegmentType = SegmentType.TEXT_DELTA, metadata?: Record<string, unknown>) => {
      const blocks: ContentBlock[] = [];
      const baseMeta = { message_id: mid, ...metadata };

      if (blockType === SegmentType.TEXT_DELTA) {
        if (!textStarted) {
          blocks.push(createContentBlock(SegmentType.TEXT_START, '', baseMeta));
          textStarted = true;
        }
        blocks.push(createContentBlock(blockType, content, baseMeta));
      } else {
        blocks.push(createContentBlock(blockType, content, baseMeta));
      }

      const msg = createMessage(
        'assistant',
        mid,
        conversationId,
        conv.session_id,
        conv.workspace_id,
        blocks,
        content
      );

      await messageQueue.publish(msg);
    };

    const context: MessageContext = {
      send_message: sendMessage,
      session_id: conv.session_id,
      conversation_id: conversationId,
      workspace_id: conv.workspace_id,
      message_id: mid,
      cancel_check: () => this.cancelCheck(conversationId),
    };

    try {
      const outcome: AgentOutcome = await runAgentGraph(
        'director_agent',
        userMessage,
        conv.workspace_id,
        context,
        parentChainMessages,
        currentConversationMessages,
      );

      if (textStarted) {
        await sendMessage('', SegmentType.TEXT_END);
      }

      if (handoffMetadata?.next_conversation_id) {
        await sendMessage('', SegmentType.STATE_CHANGE, {
          auto_approved: true,
          next_conversation_id: handoffMetadata.next_conversation_id,
        });
      }

      await sendMessage('', SegmentType.DONE);

      conv.status = ConversationStatus.COMPLETED;

      await sessionService.endConversation(conversationId);

      logger.info({
        event: 'agent.run.completed',
        conversation_id: conversationId,
        message_id: mid,
        outcome_status: outcome.status,
        produced_user_reply: outcome.produced_user_reply,
      });
    } catch (err) {
      const errorMessage = String(err);
      logger.error({
        event: 'agent.run.failed',
        conversation_id: conversationId,
        message_id: mid,
        error: errorMessage,
      });

      await sendMessage(errorMessage, SegmentType.ERROR);
      await sendMessage('', SegmentType.DONE);

      conv.status = ConversationStatus.FAILED;
      conv.error = errorMessage;

      await sessionService.failConversation(conversationId, errorMessage);
    }
  }

  async runAgent(
    workspaceId: string,
    conversationId: string,
    sessionId: string,
    messageId: string,
    userMessage: string
  ): Promise<void> {
    if (!this.conversations.has(conversationId)) {
      await this.registerConversation(conversationId, workspaceId, sessionId);
    }

    await this.sendMessage(conversationId, userMessage, messageId);
  }

  getConversation(conversationId: string): Conversation | undefined {
    return this.conversations.get(conversationId);
  }

  getConversationStatus(conversationId: string): ConversationStatus | undefined {
    return this.conversations.get(conversationId)?.status;
  }
}

export const agentService = new AgentService();
