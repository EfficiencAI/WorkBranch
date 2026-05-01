import { BaseSubAgent, type AgentContext, type SubAgentResult, type TokenCallback } from './base';
import { runAgentGraph } from '../graph/agent-graphs';
import { SegmentType } from '../../session-service/canonical';
import { logger } from '../../../core/logging';

const REVIEW_AGENT_PROMPT = `你是一个专业的代码审查代理。你的任务是审查代码质量、发现潜在问题并提供改进建议。

你可以使用以下工具：
- read_file: 读取文件内容
- list_dir: 列出目录内容
- explore_code: 探索代码库结构
- thinking: 思考工具

请根据任务描述，仔细审查代码并给出专业的审查意见。

审查要点：
1. 代码质量和可读性
2. 潜在的 bug 和错误
3. 性能问题
4. 安全隐患
5. 最佳实践建议`;

export class ReviewAgent extends BaseSubAgent {
  readonly name = 'review_agent';
  readonly description = '审查子代理 - 执行代码审查任务';
  readonly systemPrompt = REVIEW_AGENT_PROMPT;
  readonly allowedTools = ['read_file', 'list_dir', 'explore_code', 'thinking'];

  constructor(tokenCallback: TokenCallback) {
    super(tokenCallback);
  }

  async execute(taskDescription: string, context?: AgentContext): Promise<SubAgentResult> {
    logger.info({
      event: 'review_agent.execute.started',
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
        'review_agent',
        taskDescription,
        context?.workspace_id || '',
        messageContext as any,
        [],
        [],
        'DIRECT',
      );

      if (outcome.status === 'completed' && outcome.payload) {
        logger.info({
          event: 'review_agent.execute.completed',
          result_length: outcome.payload.length,
        });
        return { result: outcome.payload, error: null };
      }

      const errorMsg = outcome.exit_info.message || 'review_agent 执行失败';
      logger.error({
        event: 'review_agent.execute.failed',
        error: errorMsg,
      });
      return { result: null, error: errorMsg };
    } catch (err) {
      logger.error({
        event: 'review_agent.execute.failed',
        error: String(err),
      });

      return { result: null, error: String(err) };
    }
  }
}
