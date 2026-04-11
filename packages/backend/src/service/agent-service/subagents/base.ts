import type { SegmentType } from '../../session-service/canonical';

export interface AgentContext {
  workspace_id: string;
  conversation_id: string;
  message_id: string;
}

export interface SubAgentResult {
  result: string | null;
  error: string | null;
}

export interface SubAgentInfo {
  name: string;
  description: string;
  allowed_tools: string[];
}

export type TokenCallback = (content: string, type: SegmentType) => void;

export interface Message {
  role: string;
  content: string;
}

export abstract class BaseSubAgent {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly systemPrompt: string;
  abstract readonly allowedTools: string[];

  constructor(
    protected readonly tokenCallback: TokenCallback
  ) {}

  abstract execute(taskDescription: string, context?: AgentContext): Promise<SubAgentResult>;

  getInfo(): SubAgentInfo {
    return {
      name: this.name,
      description: this.description,
      allowed_tools: this.allowedTools,
    };
  }
}
