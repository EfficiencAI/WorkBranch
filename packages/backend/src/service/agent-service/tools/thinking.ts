import type { ToolDefinition, ToolResult, ToolExecutionContext } from './types';
import { toolRegistry } from './registry';
import { llmService } from '../service/llm-service';

const THINKING_SYSTEM_PROMPT = `你是一个专业的软件工程师助手。当前正在执行一个任务计划中的某个步骤。

你会收到：
1. 当前任务描述
2. 之前任务的执行结果（如果有）

请针对当前任务进行思考：
1. 分析任务目标
2. 结合之前的执行结果（如果有）
3. 给出你的思考过程和结论

请简洁清晰地回答，不要过于冗长。`;

async function executeThinking(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
  const taskDescription = (args.task_description || args.description || args.next_task) as string;
  
  if (!taskDescription) {
    return { result: null, error: '缺少 task_description 参数' };
  }

  try {
    const messages = [
      { role: 'user', content: taskDescription }
    ];

    let result = '';
    const stream = await llmService.chatStream(messages, THINKING_SYSTEM_PROMPT);
    
    for await (const chunk of stream) {
      result += chunk;
    }

    return { result, error: null };
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

const THINKING_TOOL: ToolDefinition = {
  name: 'thinking',
  description: '思考工具，用于分析问题、梳理思路',
  params: 'thinking:{"task_description":"(思考任务描述，例如：分析xxx的实现方案)"}',
  category: 'reasoning',
  executor: executeThinking,
};

export function registerThinkingTool(): void {
  toolRegistry.register(THINKING_TOOL);
}

export { THINKING_TOOL };
