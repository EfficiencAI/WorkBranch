import { v4 as uuidv4 } from 'uuid';
import type { AgentDefinition } from './definitions';
import { toolRegistry } from '../tools/registry';
import { llmService } from '../service/llm-service';
import { logger } from '../../../core/logging';

export class AgentRunner {
  private definition: AgentDefinition;
  private agentId: string;
  private status: 'idle' | 'running' | 'completed' | 'failed' = 'idle';

  constructor(definition: AgentDefinition) {
    this.definition = definition;
    this.agentId = `agent-${uuidv4().slice(0, 8)}`;
  }

  private resolveTools(): Array<Record<string, unknown>> {
    const allTools = toolRegistry.list();
    const resolved: Array<Record<string, unknown>> = [];

    for (const tool of allTools) {
      if (this.definition.allowed_tools.includes('*') || this.definition.allowed_tools.includes(tool.name)) {
        if (!this.definition.disallowed_tools.includes(tool.name)) {
          resolved.push({ name: tool.name, description: tool.description, params: tool.params });
        }
      }
    }

    return resolved;
  }

  private buildSystemPrompt(): string {
    if (this.definition.system_prompt_generator) {
      return this.definition.system_prompt_generator();
    }

    let prompt = `你是 ${this.definition.description}。`;
    prompt += `\n\n使用场景：${this.definition.when_to_use}`;

    if (this.definition.disallowed_tools.length > 0) {
      prompt += `\n\n禁止使用的工具：${this.definition.disallowed_tools.join(', ')}`;
    }

    return prompt;
  }

  async run(taskDescription: string, _context?: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.status = 'running';

    try {
      const systemPrompt = this.buildSystemPrompt();
      this.resolveTools();

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: taskDescription },
      ];

      let result = '';
      for await (const chunk of llmService.chatStream(messages, systemPrompt)) {
        result += chunk;
      }

      this.status = 'completed';
      return {
        agent_id: this.agentId,
        result,
        agent_type: this.definition.agent_type,
        status: 'completed',
      };
    } catch (err) {
      this.status = 'failed';
      logger.error({ event: 'agent_runner.failed', agent_type: this.definition.agent_type, error: String(err) });
      return {
        agent_id: this.agentId,
        error: String(err),
        agent_type: this.definition.agent_type,
        status: 'failed',
      };
    }
  }

  getStatus(): string {
    return this.status;
  }

  getAgentId(): string {
    return this.agentId;
  }
}
