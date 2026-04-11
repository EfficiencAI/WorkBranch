import { messageQueue } from '../session-service/mq';
import { createMessage, createContentBlock, SegmentType, type ContentBlock } from '../session-service/canonical';
import { logger } from '../../core/logging';
import { runOrchestrator, type MessageContext } from './graph/orchestrator-v2';
import { registerFileTools } from './tools/file-tools';

export class AgentService {
  private initialized = false;

  private initialize(): void {
    if (!this.initialized) {
      registerFileTools();
      this.initialized = true;
    }
  }

  async runAgent(
    workspaceId: string,
    conversationId: string,
    sessionId: string,
    messageId: string,
    userMessage: string
  ): Promise<void> {
    this.initialize();

    logger.info({
      event: 'agent.run.started',
      conversation_id: conversationId,
      workspace_id: workspaceId,
      message_id: messageId,
    });

    let textStarted = false;

    const sendMessage = (content: string = '', blockType: SegmentType = SegmentType.TEXT_DELTA) => {
      const blocks: ContentBlock[] = [];

      if (blockType === SegmentType.TEXT_DELTA) {
        if (!textStarted) {
          blocks.push(createContentBlock(SegmentType.TEXT_START, '', { message_id: messageId }));
          textStarted = true;
        }
        blocks.push(createContentBlock(blockType, content, { message_id: messageId }));
      } else {
        blocks.push(createContentBlock(blockType, content, { message_id: messageId }));
      }

      const msg = createMessage(
        'assistant',
        messageId,
        conversationId,
        sessionId,
        workspaceId,
        blocks,
        content
      );

      messageQueue.publish(msg);
    };

    const context: MessageContext = {
      send_message: sendMessage,
      session_id: sessionId,
      conversation_id: conversationId,
      workspace_id: workspaceId,
      message_id: messageId,
    };

    try {
      await runOrchestrator(userMessage, workspaceId, context);

      if (textStarted) {
        sendMessage('', SegmentType.TEXT_END);
      }
      sendMessage('', SegmentType.DONE);

      logger.info({
        event: 'agent.run.completed',
        conversation_id: conversationId,
        message_id: messageId,
      });
    } catch (err) {
      logger.error({
        event: 'agent.run.failed',
        conversation_id: conversationId,
        message_id: messageId,
        error: String(err),
      });

      sendMessage(String(err), SegmentType.ERROR);
      sendMessage('', SegmentType.DONE);
    }
  }
}

export const agentService = new AgentService();
