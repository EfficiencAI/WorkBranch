import { llmService } from './service/llm-service';
import { messageQueue } from '../session-service/mq';
import { createMessage, createContentBlock, SegmentType, type Message, type ContentBlock } from '../session-service/canonical';
import { logger } from '../../core/logging';

export class AgentService {
  async runAgent(
    workspaceId: string,
    conversationId: string,
    sessionId: string,
    messageId: string,
    userMessage: string
  ): Promise<void> {
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

    try {
      const systemPrompt = '你是一个有帮助的AI助手。请用中文回答用户的问题。';
      const messages = [{ role: 'user', content: userMessage }];

      for await (const chunk of llmService.chatStream(messages, systemPrompt)) {
        sendMessage(chunk, SegmentType.TEXT_DELTA);
      }

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
