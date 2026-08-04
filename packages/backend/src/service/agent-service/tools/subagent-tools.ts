import type { ToolDefinition, ToolResult, ToolExecutionContext } from './types';
import { toolRegistry } from './registry';
import { llmService } from '../service/llm-service';
import { logger } from '../../../core/logging';

const EXPLORE_AGENT_PROMPT = `你是一个专业的代码探索代理。你的任务是帮助用户探索和分析代码库或搜索互联网信息。

你可以使用以下工具：
- read_file: 读取文件内容
- list_dir: 列出目录内容
- explore_internet: 搜索互联网获取信息
- thinking: 思考工具

请根据任务描述，使用合适的工具完成任务，并给出清晰的分析结果。`;

const REVIEW_AGENT_PROMPT = `你是一个专业的代码审查代理。你的任务是审查代码质量、发现潜在问题并提供改进建议。

你可以使用以下工具：
- read_file: 读取文件内容
- list_dir: 列出目录内容
- explore_code: 探索代码库结构
- thinking: 思考工具

请根据任务描述，仔细审查代码并给出专业的审查意见。`;

async function executeCallExploreAgent(
  args: Record<string, unknown>,
  _context: ToolExecutionContext,
): Promise<ToolResult> {
  const taskDescription = args.task_description as string;
  if (!taskDescription) {
    return { result: null, error: '缺少 task_description 参数' };
  }

  logger.info({ event: 'subagent.explore.started', task_description: taskDescription });

  try {
    let result = '';
    for await (const chunk of llmService.chatStream(
      [{ role: 'user', content: taskDescription }],
      EXPLORE_AGENT_PROMPT,
    )) {
      result += chunk;
    }

    logger.info({ event: 'subagent.explore.completed' });
    return { result, error: null };
  } catch (err) {
    logger.error({ event: 'subagent.explore.failed', error: String(err) });
    return { result: null, error: `子代理执行失败: ${String(err)}` };
  }
}

async function executeCallReviewAgent(
  args: Record<string, unknown>,
  _context: ToolExecutionContext,
): Promise<ToolResult> {
  const taskDescription = args.task_description as string;
  if (!taskDescription) {
    return { result: null, error: '缺少 task_description 参数' };
  }

  logger.info({ event: 'subagent.review.started', task_description: taskDescription });

  try {
    let result = '';
    for await (const chunk of llmService.chatStream(
      [{ role: 'user', content: taskDescription }],
      REVIEW_AGENT_PROMPT,
    )) {
      result += chunk;
    }

    logger.info({ event: 'subagent.review.completed' });
    return { result, error: null };
  } catch (err) {
    logger.error({ event: 'subagent.review.failed', error: String(err) });
    return { result: null, error: `子代理执行失败: ${String(err)}` };
  }
}

const SUBAGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'call_explore_agent',
    description: '调用探索子代理执行代码探索和互联网搜索任务',
    params: 'call_explore_agent:{"task_description":"(交给探索子代理的任务描述)"}',
    category: 'subagent',
    executor: executeCallExploreAgent,
  },
  {
    name: 'call_review_agent',
    description: '调用审查子代理执行代码审查任务',
    params: 'call_review_agent:{"task_description":"(交给审查子代理的任务描述)"}',
    category: 'subagent',
    executor: executeCallReviewAgent,
  },
];

export function registerSubagentTools(): void {
  for (const toolDef of SUBAGENT_TOOLS) {
    toolRegistry.register(toolDef);
  }
}
