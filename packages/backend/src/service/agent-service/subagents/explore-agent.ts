import { BaseSubAgent, type AgentContext, type SubAgentResult, type TokenCallback } from './base';
import { runAgentGraph } from '../graph/agent-graphs';
import { SegmentType } from '../../session-service/canonical';
import { logger } from '../../../core/logging';

const EXPLORE_AGENT_PROMPT = `你是一个专业的代码探索代理。你的任务是帮助用户探索和分析代码库或搜索互联网信息。

你可以使用以下工具：
- read_file: 读取文件内容
- list_dir: 列出目录内容
- explore_internet: 搜索互联网获取信息
- thinking: 思考工具

请根据任务描述，使用合适的工具完成任务，并给出清晰的分析结果。`;

export class ExploreAgent extends BaseSubAgent {
  readonly name = 'explore_agent';
  readonly description = '探索子代理 - 执行代码探索和互联网搜索任务';
  readonly systemPrompt = EXPLORE_AGENT_PROMPT;
  readonly allowedTools = ['read_file', 'list_dir', 'explore_internet', 'thinking'];

  constructor(tokenCallback: TokenCallback) {
    super(tokenCallback);
  }

  async execute(taskDescription: string, context?: AgentContext): Promise<SubAgentResult> {
    logger.info({
      event: 'explore_agent.execute.started',
      task_preview: taskDescription.slice(0, 50),
      context,
    });

    try {
      const messageContext = {
        send_message: async (content: string, type: SegmentType, metadata?: Record<string, unknown>) => {
          this.tokenCallback(content, type);
        },
        conversation_id: context?.conversation_id,
        workspace_id: context?.workspace_id,
      };

      const outcome = await runAgentGraph(
        'explore_agent',
        taskDescription,
        context?.workspace_id || '',
        messageContext as any,
        [],
        [],
        'DIRECT',
      );

      if (outcome.status === 'completed' && outcome.payload) {
        logger.info({
          event: 'explore_agent.execute.completed',
          result_length: outcome.payload.length,
        });
        return { result: outcome.payload, error: null };
      }

      const errorMsg = outcome.exit_info.message || 'explore_agent 执行失败';
      logger.error({
        event: 'explore_agent.execute.failed',
        error: errorMsg,
      });
      return { result: null, error: errorMsg };
    } catch (err) {
      logger.error({
        event: 'explore_agent.execute.failed',
        error: String(err),
      });

      return { result: null, error: String(err) };
    }
  }
}
