import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentState } from '../src/service/agent-service/state/agent-state';

const { runToolExecution } = vi.hoisted(() => ({ runToolExecution: vi.fn() }));
vi.mock('../src/service/agent-service/graph/subgraphs/tool-execution-graph', () => ({
  runToolExecution,
}));

import { createActingNode } from '../src/service/agent-service/graph/v4/acting';

function baseState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    messages: [{ role: 'user', content: '测试' }],
    current_user_message_text: '测试',
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

describe('v4 acting node', () => {
  beforeEach(() => {
    runToolExecution.mockReset();
  });

  it('applies update_todo and switch_execution_mode results', async () => {
    runToolExecution.mockImplementation(async ({ toolName }: { toolName: string }) => {
      if (toolName === 'update_todo') {
        return {
          result: {
            success: true,
            todos: [{ id: 1, description: '第一步', status: 'pending' }],
            current_todo_index: 0,
            current_todo_goal: '目标',
            current_todo_done_when: '完成',
          },
          error: null,
        };
      }
      if (toolName === 'switch_execution_mode') {
        return {
          result: '已切换执行模式为 PLAN',
          error: null,
          execution_mode: 'PLAN',
          mode_reason: '任务复杂',
        };
      }
      return { result: null, error: `unexpected ${toolName}` };
    });

    const node = createActingNode({ messageContext: {} });
    const update = await node(baseState({
      pending_batch: {
        reason: '先切模式再写todo',
        calls: [
          { call_seq: 0, tool_name: 'switch_execution_mode', tool_args: { mode: 'PLAN' } },
          { call_seq: 1, tool_name: 'update_todo', tool_args: { todos: [], doingIdx: 0 } },
        ],
      },
    }));

    expect(update.execution_mode).toBe('PLAN');
    expect(update.mode_reason).toBe('任务复杂');
    expect(update.todos).toHaveLength(1);
    expect(update.current_todo_index).toBe(0);
    expect(update.iteration_count).toBe(1);
    expect(update._route_target).toBe('reasoning');
  });

  it('records failures and keeps call_seq order', async () => {
    runToolExecution.mockImplementation(async ({ toolName }: { toolName: string }) => {
      if (toolName === 'read_file') return { result: '内容', error: null };
      return { result: null, error: 'boom' };
    });

    const node = createActingNode({ messageContext: {} });
    const update = await node(baseState({
      pending_batch: {
        reason: '并行',
        calls: [
          { call_seq: 1, tool_name: 'explode', tool_args: {} },
          { call_seq: 0, tool_name: 'read_file', tool_args: { path: '/a' } },
        ],
      },
    }));

    const records = update.tool_records?.filter((r) => r.call_seq !== undefined) ?? [];
    expect(records.map((r) => r.call_seq)).toEqual([0, 1]);
    expect(records[1].status).toBe('failed');
    expect(update.acting_failures).toHaveLength(1);
    expect(update.acting_failures?.[0].error).toBe('boom');
  });

  it('sets final_reply from chat fallback tool', async () => {
    runToolExecution.mockImplementation(async ({ toolName }: { toolName: string }) => {
      if (toolName === 'chat') return { result: '最终回复', error: null };
      return { result: null, error: `unexpected ${toolName}` };
    });

    const node = createActingNode({ messageContext: {} });
    const update = await node(baseState({
      pending_batch: {
        reason: 'chat',
        calls: [{ call_seq: 0, tool_name: 'chat', tool_args: { description: '总结' } }],
      },
    }));

    expect(update.final_reply).toBe('最终回复');
    expect(update._route_target).toBe('reasoning');
  });

  it('returns reasoning route on empty batch', async () => {
    const node = createActingNode({ messageContext: {} });
    const update = await node(baseState({ pending_batch: { reason: '', calls: [] } }));
    expect(update._route_target).toBe('reasoning');
    expect(update.acting_failures).toHaveLength(1);
  });
});
