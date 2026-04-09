import { conversationDAO } from '../../data';
import { SegmentType } from './canonical';

interface DraftMessage {
  id: string;
  conversation_id: string;
  session_id: number;
  user_content: string;
  assistant_content: string | null;
  thinking_content: string | null;
  status: string;
  created_at: string;
}

class ConversationBuffer {
  private drafts: Map<string, DraftMessage> = new Map();

  async createMessage(
    messageId: string,
    conversationId: string,
    sessionId: number,
    userContent: string
  ): Promise<void> {
    const draft: DraftMessage = {
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
    conversationDAO.createMessage(messageId, conversationId, sessionId, userContent, 'streaming');
  }

  hasDraft(messageId: string): boolean {
    return this.drafts.has(messageId);
  }

  getDraft(messageId: string): DraftMessage | undefined {
    return this.drafts.get(messageId);
  }

  async appendContent(messageId: string, content: string, isThinking: boolean = false): Promise<void> {
    const draft = this.drafts.get(messageId);
    if (!draft) return;

    if (isThinking) {
      draft.thinking_content = (draft.thinking_content || '') + content;
    } else {
      draft.assistant_content = (draft.assistant_content || '') + content;
    }
  }

  async completeMessage(messageId: string): Promise<void> {
    const draft = this.drafts.get(messageId);
    if (!draft) return;

    conversationDAO.updateMessageAssistant(
      messageId,
      draft.assistant_content || '',
      'completed',
      draft.thinking_content
    );

    this.drafts.delete(messageId);
  }

  async failMessage(messageId: string): Promise<void> {
    const draft = this.drafts.get(messageId);
    if (!draft) return;

    conversationDAO.updateMessageStatus(messageId, 'failed');
    this.drafts.delete(messageId);
  }

  async consumeMessage(message: import('./canonical').Message): Promise<void> {
    const draft = this.drafts.get(message.message_id);
    if (!draft) return;

    for (const block of message.content_blocks) {
      if (block.type === 'text_delta' as SegmentType) {
        draft.assistant_content = (draft.assistant_content || '') + block.content;
      } else if (block.type === 'thinking_delta' as SegmentType) {
        draft.thinking_content = (draft.thinking_content || '') + block.content;
      }
    }
  }

  clear(conversationId: string): void {
    for (const [id, draft] of this.drafts) {
      if (draft.conversation_id === conversationId) {
        this.drafts.delete(id);
      }
    }
  }
}

export const conversationBuffer = new ConversationBuffer();
