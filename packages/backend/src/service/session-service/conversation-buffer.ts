import { conversationDAO } from '../../data';
import { SegmentType, type ContentBlock } from './canonical';

interface DraftMessage {
  id: string;
  conversation_id: string;
  session_id: number;
  user_content: string;
  assistant_content: string | null;
  thinking_content: string | null;
  content_blocks: ContentBlock[];
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
      content_blocks: [],
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

  getDraftsByConversation(conversationId: string): DraftMessage[] {
    return Array.from(this.drafts.values()).filter((draft) => draft.conversation_id === conversationId);
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

    await conversationDAO.updateMessageAssistant(
      messageId,
      draft.assistant_content || '',
      'completed',
      draft.thinking_content ?? null,
      JSON.stringify(draft.content_blocks)
    );

    this.drafts.delete(messageId);
  }

  async failMessage(messageId: string): Promise<void> {
    const draft = this.drafts.get(messageId);
    if (!draft) return;

    conversationDAO.updateMessageAssistant(
      messageId,
      draft.assistant_content || '',
      'failed',
      draft.thinking_content ?? null,
      JSON.stringify(draft.content_blocks)
    );
    this.drafts.delete(messageId);
  }

  async consumeMessage(message: import('./canonical').Message): Promise<void> {
    const draft = this.drafts.get(message.message_id);
    if (!draft) {
      console.warn('[buffer] consumeMessage: no draft for mid=', message.message_id,
        'available:', Array.from(this.drafts.keys()));
      return;
    }

    for (const block of message.content_blocks) {
      const t = block.type as SegmentType;
      draft.content_blocks.push({
        type: block.type,
        content: block.content,
        metadata: { ...block.metadata },
      });
      // Agent uses CHAT_DELTA for streaming text; also handle TEXT_DELTA/THINKING_DELTA
      if (t === SegmentType.TEXT_DELTA || t === SegmentType.CHAT_DELTA) {
        draft.assistant_content = (draft.assistant_content || '') + block.content;
      } else if (t === SegmentType.THINKING_DELTA) {
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
