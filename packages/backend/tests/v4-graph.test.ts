import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentType } from '../src/service/session-service/canonical';

const { llmService } = vi.hoisted(() => ({
  llmService: { structuredOutput: vi.fn(), chat: vi.fn() },
}));
vi.mock('../src/service/agent-service/service/llm-service', () => ({ llmService }));
vi.mock('../src/service/settings-service', () => ({
  settingsService: {
    get: (key: string) => (key === 'agent:structured_output' ? true : undefined),
  },
}));

import { runAgentGraph } from '../src/service/agent-service/graph/agent-graphs';

describe('v4 graph integration', () => {
  beforeEach(() => {
    llmService.structuredOutput.mockReset();
    llmService.chat.mockReset();
  });

  it('runs explore_agent loop to a final text reply', async () => {
    llmService.structuredOutput.mockResolvedValue({ type: 'text', content: '探索完成' });

    const events: string[] = [];
    const outcome = await runAgentGraph(
      'explore_agent',
      '看看项目结构',
      'ws-test',
      {
        send_message: async (_content: string, type: SegmentType) => {
          events.push(type);
        },
        session_id: 's1',
        conversation_id: 'c1',
        workspace_id: 'ws-test',
        message_id: 'm1',
      },
      [],
      [],
      undefined,
      false,
      true,
    );

    expect(outcome.status, outcome.exit_info?.message ?? 'no message').toBe('completed');
    expect(outcome.final_state.final_reply).toBe('探索完成');
    expect(outcome.produced_user_reply).toBe(true);
    expect(events).toContain(SegmentType.CHAT_START);
    expect(events).toContain(SegmentType.CHAT_END);
  });

  it('executes a tool batch then finishes with text', async () => {
    llmService.structuredOutput
      .mockResolvedValueOnce({
        type: 'tool_calls',
        content: {
          reason: '读取',
          calls: [{ call_seq: 0, tool_name: 'read_file', tool_args: { path: '/a' } }],
        },
      })
      .mockResolvedValueOnce({ type: 'text', content: '读取完成' });

    const outcome = await runAgentGraph(
      'review_agent',
      '审查代码',
      'ws-test',
      {
        send_message: async () => undefined,
        session_id: 's1',
        conversation_id: 'c1',
        workspace_id: 'ws-test',
        message_id: 'm1',
      },
      [],
      [],
      undefined,
      false,
      true,
    );

    expect(outcome.status, outcome.exit_info?.message ?? 'no message').toBe('completed');
    expect(outcome.final_state.final_reply).toBe('读取完成');
    expect(outcome.final_state.iteration_count).toBe(1);
    expect(outcome.final_state.tool_records?.filter((r) => r.call_seq !== undefined)).toHaveLength(1);
  });

  it('runs director_agent main graph with embedded v4 loop', async () => {
    llmService.structuredOutput.mockResolvedValue({ type: 'text', content: '主图完成' });

    const outcome = await runAgentGraph(
      'director_agent',
      '帮我完成一个任务',
      'ws-test',
      {
        send_message: async () => undefined,
        session_id: 's1',
        conversation_id: 'c1',
        workspace_id: 'ws-test',
        message_id: 'm1',
      },
      [],
      [],
      undefined,
      false,
      true,
    );

    expect(outcome.status, outcome.exit_info?.message ?? 'no message').toBe('completed');
    expect(outcome.final_state.final_reply).toBe('主图完成');
    expect(outcome.final_state.agent_type).toBe('director_agent');
  });
});