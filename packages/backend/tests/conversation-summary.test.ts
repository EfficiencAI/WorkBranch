import { beforeEach, describe, expect, it, vi } from 'vitest';

const { all, prepare } = vi.hoisted(() => {
  const allMock = vi.fn();
  return {
    all: allMock,
    prepare: vi.fn(() => ({ all: allMock })),
  };
});

vi.mock('../src/core/database', () => ({
  db: { prepare },
}));

import { ConversationDAO } from '../src/data/conversation-dao';

describe('conversation summary previews', () => {
  beforeEach(() => {
    all.mockReset();
    prepare.mockClear();
  });

  it('returns the first user prompt and latest assistant conclusion with each summary', () => {
    all.mockReturnValue([
      {
        id: 'conversation-1',
        session_id: 7,
        workspace_id: 'workspace-1',
        parent_conversation_id: null,
        title: '登录鉴权方案',
        state: 'completed',
        created_at: '2026-08-03T14:00:00.000Z',
        updated_at: '2026-08-03T14:10:00.000Z',
        ended_at: null,
        message_count: 2,
        error: null,
        position_x: 120,
        position_y: 240,
        user_prompt_preview: '登录接口需要支持哪些方式？',
        assistant_conclusion_preview: '统一会话签发并增加双维度限流。',
      },
    ]);

    const summaries = new ConversationDAO().listConversationSummariesBySession(7);

    expect(all).toHaveBeenCalledWith(7);
    expect(summaries[0]).toMatchObject({
      id: 'conversation-1',
      user_prompt_preview: '登录接口需要支持哪些方式？',
      assistant_conclusion_preview: '统一会话签发并增加双维度限流。',
    });

    const sql = String(prepare.mock.calls[0]?.[0]);
    expect(sql).toContain('AS user_prompt_preview');
    expect(sql).toContain('AS assistant_conclusion_preview');
    expect(sql).toContain('ORDER BY m.created_at ASC, m.id ASC');
    expect(sql).toContain('ORDER BY m.created_at DESC, m.id DESC');
  });
});
