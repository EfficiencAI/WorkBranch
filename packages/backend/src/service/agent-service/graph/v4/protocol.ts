export interface ToolCallSpec {
  call_seq: number;
  tool_name: string;
  tool_args?: Record<string, unknown>;
  task_description?: string;
}

export interface ToolCallsContent {
  reason: string;
  calls: ToolCallSpec[];
}

export type LeaderOutput =
  | { type: 'tool_calls'; content: ToolCallsContent }
  | { type: 'text'; content: string }
  | { type: 'done'; content: string | null };

export class LeaderOutputParseError extends Error {
  category: string;

  constructor(category: string, message: string) {
    super(message);
    this.category = category;
  }
}

export function stripCodeFence(text: string): string {
  let result = text.trim();
  if (result.startsWith('```json')) result = result.slice(7);
  else if (result.startsWith('```')) result = result.slice(3);
  if (result.endsWith('```')) result = result.slice(0, -3);
  return result.trim();
}

export function parseLeaderOutput(raw: string): LeaderOutput {
  const text = stripCodeFence(raw);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    // 容错：优先整体解析，失败时提取首个 { ... } 子串（兼容 thinking 模式带思维链的输出）
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        data = JSON.parse(text.slice(start, end + 1));
      } catch {
        throw new LeaderOutputParseError(
          'parse',
          `JSON 解析失败: ${String(err)}\n原始输出: ${text.slice(0, 2000)}`,
        );
      }
    } else {
      throw new LeaderOutputParseError(
        'parse',
        `JSON 解析失败: ${String(err)}\n原始输出: ${text.slice(0, 2000)}`,
      );
    }
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new LeaderOutputParseError('shape', 'leader 输出必须是 JSON 对象');
  }

  const record = data as Record<string, unknown>;
  const type = record.type;
  if (type !== 'tool_calls' && type !== 'text' && type !== 'done') {
    throw new LeaderOutputParseError(
      'shape',
      `type 必须是 tool_calls/text/done，实际: ${String(type)}`,
    );
  }

  const content = record.content;
  if (type === 'tool_calls') {
    if (typeof content !== 'object' || content === null) {
      throw new LeaderOutputParseError('shape', 'tool_calls 的 content 必须是 {reason, calls[]}');
    }
    const calls = (content as Record<string, unknown>).calls;
    if (!Array.isArray(calls) || calls.length === 0) {
      throw new LeaderOutputParseError('shape', 'tool_calls.content.calls 必须是非空数组');
    }
    const specs: ToolCallSpec[] = calls.map((call, index) => {
      if (typeof call !== 'object' || call === null) {
        throw new LeaderOutputParseError('shape', `calls[${index}] 必须是对象`);
      }
      const c = call as Record<string, unknown>;
      if (typeof c.call_seq !== 'number' || typeof c.tool_name !== 'string' || !c.tool_name) {
        throw new LeaderOutputParseError('shape', `calls[${index}] 缺少 call_seq 或 tool_name`);
      }
      return {
        call_seq: c.call_seq,
        tool_name: c.tool_name,
        tool_args:
          typeof c.tool_args === 'object' && c.tool_args !== null
            ? (c.tool_args as Record<string, unknown>)
            : {},
        task_description: typeof c.task_description === 'string' ? c.task_description : undefined,
      };
    });
    return {
      type: 'tool_calls',
      content: {
        reason: String((content as Record<string, unknown>).reason || ''),
        calls: specs,
      },
    };
  }

  if (type === 'text') {
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new LeaderOutputParseError('shape', 'text 的 content 必须是非空字符串');
    }
    return { type: 'text', content };
  }

  return { type: 'done', content: typeof content === 'string' ? content : null };
}

export function validateLeaderOutput(parsed: LeaderOutput, allowedTools: string[]): string[] {
  const issues: string[] = [];
  if (parsed.type !== 'tool_calls') return issues;

  const calls = parsed.content.calls;
  const seqs = calls.map((call) => call.call_seq);
  if (new Set(seqs).size !== seqs.length) {
    issues.push(`call_seq 重复: ${seqs.join(',')}`);
  }

  for (const call of calls) {
    if (!call.tool_name) {
      issues.push('存在缺少 tool_name 的调用');
    } else if (allowedTools.length > 0 && !allowedTools.includes(call.tool_name)) {
      issues.push(`tool_name '${call.tool_name}' 不在协议内`);
    }
  }

  return issues;
}

export function leaderOutputJsonSchema(): Record<string, unknown> {
  return {
    name: 'leader_output',
    strict: false,
    schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['tool_calls', 'text', 'done'] },
        content: {
          oneOf: [
            {
              type: 'object',
              properties: {
                reason: { type: 'string' },
                calls: {
                  type: 'array',
                  minItems: 1,
                  items: {
                    type: 'object',
                    properties: {
                      call_seq: { type: 'integer', minimum: 0 },
                      tool_name: { type: 'string' },
                      tool_args: { type: 'object' },
                      task_description: { type: 'string' },
                    },
                    required: ['call_seq', 'tool_name'],
                    additionalProperties: true,
                  },
                },
              },
              required: ['calls'],
              additionalProperties: true,
            },
            { type: 'string' },
            { type: ['string', 'null'] },
          ],
        },
      },
      required: ['type'],
      additionalProperties: true,
    },
  };
}
