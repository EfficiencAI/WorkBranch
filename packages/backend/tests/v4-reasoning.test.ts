import { describe, expect, it, vi } from 'vitest';
import type { AgentState, ToolRecord } from '../src/service/agent-service/state/agent-state';
import {
  createReasoningNode,
  detectToolFailureLoop,
  routeAfterReasoning,
} from '../src/service/agent-service/graph/v4/reasoning';

function baseState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [{ role: 'user', content: '测试任务' }],
    current_user_message_text: '测试任务',
    workspace_id: 'ws1',
    plan: [],
    current_step: 0,
    results: [],
    plan_failed: false,
    tool_history: [],
    replan_count: 0,
    agent_type: 'director_agent',
    is_root_graph: true,
    parent_chain_messages: [],
    current_conversation_messages: [],
    tool_records: [],
    ...overrides,
  };
}

describe('v4 detectToolFailureLoop', () => {
  it('returns null with fewer than 4 records', () => {
    expect(detectToolFailureLoop([])).toBeNull();
    expect(detectToolFailureLoop([
      { call_seq: 0, tool_name: 'read_file', status: 'failed' },
    ])).toBeNull();
  });

  it('detects 3 consecutive same-tool failures', () => {
    const records: ToolRecord[] = [
      { call_seq: 0, tool_name: 'read_file', status: 'failed', round: 1 },
      { call_seq: 0, tool_name: 'read_file', status: 'failed', round: 2 },
      { call_seq: 0, tool_name: 'read_file', status: 'failed', round: 3 },
      { call_seq: 0, tool_name: 'read_file', status: 'failed', round: 4 },
    ];
    const loop = detectToolFailureLoop(records);
    expect(loop).not.toBeNull();
    expect(loop?.toolName).toBe('read_file');
  });

  it('does not detect when latest tool succeeds', () => {
    const records: ToolRecord[] = [
      { call_seq: 0, tool_name: 'read_file', status: 'failed', round: 1 },
      { call_seq: 0, tool_name: 'read_file', status: 'failed', round: 2 },
      { call_seq: 0, tool_name: 'read_file', status: 'failed', round: 3 },
      { call_seq: 0, tool_name: 'read_file', status: 'success', round: 4 },
    ];
    expect(detectToolFailureLoop(records)).toBeNull();
  });
});

describe('v4 reasoning gateways', () => {
  it('routes to finalize when final_reply already set', async () => {
    const node = createReasoningNode({ llmService: { chat: async () => 'unused' } });
    const update = await node(baseState({ final_reply: '已回复' }));
    expect(update.final_reply).toBe('已回复');
    expect(update._route_target).toBe('finalize');
  });

  it('terminates at iteration limit with fixed template', async () => {
    const node = createReasoningNode({ llmService: { chat: async () => 'unused' } });
    const update = await node(baseState({ iteration_count: 32, max_iterations: 32 }));
    expect(update._route_target).toBe('finalize');
    expect(String(update.final_reply)).toContain('最大轮次');
  });

  it('terminates at tool failure loop', async () => {
    const node = createReasoningNode({ llmService: { chat: async () => 'unused' } });
    const update = await node(baseState({
      tool_records: [
        { call_seq: 0, tool_name: 'read_file', status: 'failed', round: 1 },
        { call_seq: 0, tool_name: 'read_file', status: 'failed', round: 2 },
        { call_seq: 0, tool_name: 'read_file', status: 'failed', round: 3 },
        { call_seq: 0, tool_name: 'read_file', status: 'failed', round: 4 },
      ],
    }));
    expect(update._route_target).toBe('finalize');
    expect(String(update.final_reply)).toContain('失败循环');
  });

  it('terminates after decision retry limit', async () => {
    const node = createReasoningNode({ llmService: { chat: async () => 'unused' } });
    const update = await node(baseState({
      decision_error_count: 3,
      parse_error: '多次解析失败',
      parse_error_raw: 'raw',
    }));
    expect(update._route_target).toBe('finalize');
    expect(String(update.final_reply)).toContain('解析连续失败');
  });

  it('executes pre-seeded pending_tools batch', async () => {
    const node = createReasoningNode({ llmService: { chat: async () => 'unused' } });
    const update = await node(baseState({
      pending_tools: [
        { tool: 'chat', args: { description: '多模态' } },
      ],
    }));
    expect(update._route_target).toBe('acting');
    expect((update.pending_batch as { calls: unknown[] }).calls).toHaveLength(1);
    expect((update.pending_batch as { calls: Array<{ tool_name: string }> }).calls[0].tool_name).toBe('chat');
  });
});

describe('v4 reasoning LLM routing', () => {
  it('routes tool_calls to acting', async () => {
    const node = createReasoningNode({
      llmService: {
        structuredOutput: async () => ({
          type: 'tool_calls',
          content: {
            reason: '读取文件',
            calls: [{ call_seq: 0, tool_name: 'read_file', tool_args: { path: '/a' } }],
          },
        }),
      },
      settingsService: {
        get: (key: string) => (key === 'agent:structured_output' ? true : undefined),
      },
    });
    const update = await node(baseState());
    expect(update._route_target).toBe('acting');
    expect((update.pending_batch as { reason: string }).reason).toBe('读取文件');
  });

  it('routes text to finalize when closuring disabled', async () => {
    const node = createReasoningNode({
      llmService: {
        structuredOutput: async () => ({ type: 'text', content: '任务完成' }),
      },
      settingsService: {
        get: (key: string) => (key === 'agent:structured_output' ? true : undefined),
      },
      closuringEnabled: false,
    });
    const update = await node(baseState());
    expect(update._route_target).toBe('finalize');
    expect(update.final_reply).toBe('任务完成');
  });

  it('retries internally on semantic validation failure', async () => {
    let calls = 0;
    const node = createReasoningNode({
      llmService: {
        structuredOutput: async () => {
          calls += 1;
          if (calls === 1) {
            return {
              type: 'tool_calls',
              content: { reason: 'r', calls: [{ call_seq: 0, tool_name: 'not_a_tool', tool_args: {} }] },
            };
          }
          return { type: 'text', content: '修正后完成' };
        },
      },
      settingsService: {
        get: (key: string) => (key === 'agent:structured_output' ? true : undefined),
      },
    });
    const first = await node(baseState());
    expect(first._route_target).toBe('reasoning');
    expect(first.decision_error_count).toBe(1);
    expect(String(first.parse_error)).toContain('not_a_tool');

    const second = await node(baseState({
      decision_error_count: first.decision_error_count as number,
      parse_error: first.parse_error,
      parse_error_raw: first.parse_error_raw,
    }));
    expect(second._route_target).toBe('finalize');
    expect(second.final_reply).toBe('修正后完成');
    expect(second.decision_error_count).toBe(0);
  });
});

describe('v4 structured output fallback', () => {
  it('falls back to plain chat when structured output is unsupported', async () => {
    const node = createReasoningNode({
      llmService: {
        structuredOutput: async () => {
          throw new Error('tool_choice not supported in thinking mode');
        },
        chatStream: async function* () { yield '{"type":"text","content":"降级完成"}'; },
      },
      settingsService: {
        get: (key: string) => (key === 'agent:structured_output' ? true : undefined),
      },
    });
    const update = await node(baseState());
    expect(update._route_target).toBe('finalize');
    expect(update.final_reply).toBe('降级完成');
  });

  it('uses plain chat by default when structured output is disabled', async () => {
    const structured = vi.fn(async () => {
      throw new Error('should not be called');
    });
    const chatStream = vi.fn(async function* () { yield '{"type":"text","content":"chat完成"}'; });
    const node = createReasoningNode({
      llmService: { structuredOutput: structured, chatStream },
    });
    const update = await node(baseState());
    expect(structured).not.toHaveBeenCalled();
    expect(chatStream).toHaveBeenCalledTimes(1);
    expect(update.final_reply).toBe('chat完成');
  });
});

describe('v4 reasoning thinking streaming', () => {
  it('emits thinking_start, per-chunk deltas, and thinking_end', async () => {
    const sent: Array<{ type: string; content: string }> = [];
    const sendMessage = vi.fn(async (content: string, type: string) => {
      sent.push({ type, content });
    });
    const node = createReasoningNode({
      llmService: {
        chatStream: async function* () {
          yield '{"type":"text","content":"stream done"}';
        },
      },
      messageContext: { send_message: sendMessage as never },
    });
    const update = await node(baseState());
    expect(update.final_reply).toBe('stream done');
    expect(sent.map((e) => e.type)).toEqual(['thinking_start', 'thinking_delta', 'thinking_end']);
    expect(sent[1].content).toContain('stream done');
  });
});

describe('v4 routeAfterReasoning', () => {
  it('falls back to reasoning', () => {
    expect(routeAfterReasoning(baseState())).toBe('reasoning');
    expect(routeAfterReasoning(baseState({ _route_target: 'acting' }))).toBe('acting');
  });
});