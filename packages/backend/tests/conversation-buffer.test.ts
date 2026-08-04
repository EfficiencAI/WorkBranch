import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentType } from '../src/service/session-service/canonical';

const dao = vi.hoisted(() => ({
  createMessage: vi.fn(),
  updateMessageAssistant: vi.fn(),
}));

vi.mock('../src/data', () => ({ conversationDAO: dao }));

import { conversationBuffer } from '../src/service/session-service/conversation-buffer';

describe('ConversationBuffer content block persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationBuffer.clear('conversation-1');
  });

  it('persists workflow blocks separately from final assistant text', async () => {
    await conversationBuffer.createMessage('message-1', 'conversation-1', 1, 'hello');
    await conversationBuffer.consumeMessage({
      role: 'assistant',
      message_id: 'message-1',
      conversation_id: 'conversation-1',
      session_id: '1',
      workspace_id: 'workspace-1',
      timestamp: new Date().toISOString(),
      content: '',
      metadata: {},
      content_blocks: [
        { type: SegmentType.STATE_CHANGE, content: 'Trae step 1: completed', metadata: {} },
        { type: SegmentType.TOOL_CALL, content: '{"name":"bash"}', metadata: { tool_name: 'bash' } },
        { type: SegmentType.THINKING_DELTA, content: 'Checking files', metadata: {} },
        { type: SegmentType.TEXT_DELTA, content: 'Final answer', metadata: {} },
      ],
    });
    await conversationBuffer.completeMessage('message-1');

    expect(dao.updateMessageAssistant).toHaveBeenCalledTimes(1);
    const call = dao.updateMessageAssistant.mock.calls[0];
    expect(call[1]).toBe('Final answer');
    expect(call[2]).toBe('completed');
    expect(call[3]).toBe('Checking files');
    expect(JSON.parse(call[4])).toHaveLength(4);
  });
});
