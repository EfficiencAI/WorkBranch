import { describe, expect, it } from 'vitest';
import {
  LeaderOutputParseError,
  leaderOutputJsonSchema,
  parseLeaderOutput,
  stripCodeFence,
  validateLeaderOutput,
} from '../src/service/agent-service/graph/v4/protocol';

describe('v4 leader output protocol', () => {
  it('parses tool_calls with 1..N parallel calls', () => {
    const parsed = parseLeaderOutput(JSON.stringify({
      type: 'tool_calls',
      content: {
        reason: '并行读取',
        calls: [
          { call_seq: 1, tool_name: 'read_file', tool_args: { path: '/a' } },
          { call_seq: 2, tool_name: 'list_dir', tool_args: { directory: '/b' } },
        ],
      },
    }));
    expect(parsed.type).toBe('tool_calls');
    if (parsed.type !== 'tool_calls') return;
    expect(parsed.content.calls).toHaveLength(2);
    expect(parsed.content.calls[1].tool_name).toBe('list_dir');
  });

  it('strips json code fences before parsing', () => {
    const parsed = parseLeaderOutput('```json\n{"type":"text","content":"完成"}\n```');
    expect(parsed).toEqual({ type: 'text', content: '完成' });
  });

  it('parses done with null content', () => {
    expect(parseLeaderOutput('{"type":"done","content":null}')).toEqual({
      type: 'done',
      content: null,
    });
  });

  it('rejects malformed JSON with category', () => {
    expect(() => parseLeaderOutput('{not-json')).toThrow(LeaderOutputParseError);
  });

  it('rejects unknown type', () => {
    expect(() => parseLeaderOutput('{"type":"chat","content":"x"}')).toThrow(
      LeaderOutputParseError,
    );
  });

  it('rejects empty tool_calls array', () => {
    expect(() =>
      parseLeaderOutput('{"type":"tool_calls","content":{"reason":"r","calls":[]}}'),
    ).toThrow(LeaderOutputParseError);
  });

  it('detects duplicate call_seq and unknown tools in validation', () => {
    const parsed = parseLeaderOutput(JSON.stringify({
      type: 'tool_calls',
      content: {
        reason: 'r',
        calls: [
          { call_seq: 1, tool_name: 'read_file', tool_args: {} },
          { call_seq: 1, tool_name: 'hack_tool', tool_args: {} },
        ],
      },
    }));
    const issues = validateLeaderOutput(parsed, ['read_file']);
    expect(issues.join(';')).toContain('call_seq 重复');
    expect(issues.join(';')).toContain('hack_tool');
  });

  it('passes validation for allowed tools', () => {
    const parsed = parseLeaderOutput(JSON.stringify({
      type: 'tool_calls',
      content: {
        reason: 'r',
        calls: [{ call_seq: 0, tool_name: 'read_file', tool_args: {} }],
      },
    }));
    expect(validateLeaderOutput(parsed, ['read_file'])).toEqual([]);
  });

  it('exposes a JSON schema for structured output', () => {
    const schema = leaderOutputJsonSchema();
    expect(schema.name).toBe('leader_output');
    expect(schema.schema.properties.type.enum).toEqual(['tool_calls', 'text', 'done']);
  });

  it('stripCodeFence handles plain text', () => {
    expect(stripCodeFence('  hello  ')).toBe('hello');
  });
});
