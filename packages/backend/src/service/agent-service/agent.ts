import { messageQueue } from '../session-service/mq';
import { createMessage, createContentBlock, SegmentType, type ContentBlock } from '../session-service/canonical';
import { logger } from '../../core/logging';
import type { AgentOutcome } from './graph/agent-graphs';
import { initializeTools } from './tools';
import { sessionService } from '../session-service';
import { workspaceService } from './service/workspace-service';
import { resolveAgentAdapter, type AgentId } from './adapters';

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
  private abortControllers: Map<string, AbortController> = new Map();

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
    this.abortControllers.get(conversationId)?.abort();
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
    agentId: AgentId = 'builtin',
    writeConfirmed: boolean = false,
  ): Promise<void> {
    this.initialize();

    const conv = this.conversations.get(conversationId);
    if (!conv) {
      throw new Error(`对话 ${conversationId} 不存在`);
    }

    conv.messages.push({ role: 'user', content: userMessage });
    conv.status = ConversationStatus.RUNNING;

    const mid = messageId || this.generateId();
    const adapter = resolveAgentAdapter(agentId);

    logger.info({
      event: 'agent.run.started',
      conversation_id: conversationId,
      workspace_id: conv.workspace_id,
      message_id: mid,
      agent_id: adapter.id,
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
      console.log('[agent] published msg, mid=', mid, 'type=', blockType);
    };

    const abortController = new AbortController();
    this.abortControllers.set(conversationId, abortController);

    try {
      const workspaceDir = workspaceService.getWorkspaceDir(conv.workspace_id);

      if (!workspaceDir) {
        throw new Error(`工作区 ${conv.workspace_id} 不存在`);
      }

      if (adapter.id === 'trae' && writeConfirmed !== true) {
        throw new Error('Trae CLI 允许修改工作区文件，执行前必须确认');
      }

      messageQueue.registerStream(conversationId, conv.session_id, conv.workspace_id);

      const outcome: AgentOutcome = await adapter.run({
        userMessage,
        workspaceId: conv.workspace_id,
        workspaceDir,
        conversationId,
        sessionId: conv.session_id,
        messageId: mid,
        parentChainMessages: parentChainMessages || [],
        currentConversationMessages: currentConversationMessages || [],
        signal: abortController.signal,
        cancelCheck: () => this.cancelCheck(conversationId),
        publish: sendMessage,
      });

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
        agent_id: adapter.id,
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
    } finally {
      this.abortControllers.delete(conversationId);
    }
  }

  async runAgent(
    workspaceId: string,
    conversationId: string,
    sessionId: string,
    messageId: string,
    userMessage: string,
    parentChainMessages?: Array<Record<string, unknown>>,
    currentConversationMessages?: Array<Record<string, unknown>>,
    agentId: AgentId = 'builtin',
    writeConfirmed: boolean = false,
  ): Promise<void> {
    if (!this.conversations.has(conversationId)) {
      await this.registerConversation(conversationId, workspaceId, sessionId);
    }

    await this.sendMessage(
      conversationId,
      userMessage,
      messageId,
      parentChainMessages,
      currentConversationMessages,
      undefined,
      agentId,
      writeConfirmed,
    );
  }

  getConversation(conversationId: string): Conversation | undefined {
    return this.conversations.get(conversationId);
  }

  getConversationStatus(conversationId: string): ConversationStatus | undefined {
    return this.conversations.get(conversationId)?.status;
  }
}

export const agentService = new AgentService();
