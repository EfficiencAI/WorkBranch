import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { settingsService } from '../../settings-service';
import { logger } from '../../../core/logging';
import { compressionCache } from '../cache';
import { CacheKeyGenerator } from '../cache/key-generator';

interface Message {
  role: string;
  content: string;
}

interface UsageInfo {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

class LLMServiceImpl {
  private llm: ChatOpenAI | null = null;

  private getLLM(): ChatOpenAI {
    if (!this.llm) {
      this.llm = this.buildLLM();
    }
    return this.llm;
  }

  private buildLLM(): ChatOpenAI {
    const apiKey = settingsService.get('llm:api_key') as string;
    const baseUrl = settingsService.get('llm:base_url') as string;
    const model = settingsService.get('llm:model') as string;
    const temperature = settingsService.get('llm:temperature') as number;
    const maxTokens = settingsService.get('llm:max_tokens') as number;

    if (!apiKey) {
      throw new Error('LLM API key not configured. Please set llm:api_key in settings.');
    }

    return new ChatOpenAI({
      apiKey: apiKey,
      configuration: {
        baseURL: baseUrl,
      },
      modelName: model,
      temperature,
      maxTokens,
      timeout: 120000,
    });
  }

  private buildLLMMessages(messages: Message[], systemPrompt?: string): BaseMessage[] {
    const lcMessages: BaseMessage[] = [];

    if (systemPrompt) {
      lcMessages.push(new SystemMessage(systemPrompt));
    }

    for (const msg of messages) {
      const role = msg.role || 'user';
      const content = msg.content || '';

      if (role === 'user') {
        lcMessages.push(new HumanMessage(content));
      } else if (role === 'assistant') {
        lcMessages.push(new AIMessage(content));
      } else if (role === 'system') {
        lcMessages.push(new SystemMessage(content));
      }
    }

    return lcMessages;
  }

  private extractUsage(result: unknown): UsageInfo {
    const anyResult = result as Record<string, unknown>;
    const usageMetadata = anyResult?.usage_metadata as Record<string, unknown> | undefined;
    const responseMetadata = anyResult?.response_metadata as Record<string, unknown> | undefined;

    let usage: Record<string, unknown> | undefined = usageMetadata;
    if (!usage && responseMetadata) {
      usage = responseMetadata.token_usage as Record<string, unknown> | undefined;
    }

    if (!usage) return {};

    const promptTokens = (usage.input_tokens as number) ?? (usage.prompt_tokens as number);
    const completionTokens = (usage.output_tokens as number) ?? (usage.completion_tokens as number);
    const totalTokens = usage.total_tokens as number | undefined;

    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens ?? (promptTokens && completionTokens ? promptTokens + completionTokens : undefined),
    };
  }

  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    const cacheKey = CacheKeyGenerator.generate(
      { role: 'user', content: JSON.stringify({ messages, systemPrompt }) },
      1.0,
      'v1'
    );

    const cached = await compressionCache.get(cacheKey);
    if (cached && typeof cached.result === 'string') {
      logger.info({
        event: 'llm.cache.hit',
        operation: 'chat',
      });
      return cached.result;
    }

    const llm = this.getLLM();
    const lcMessages = this.buildLLMMessages(messages, systemPrompt);

    logger.info({
      event: 'llm.call.started',
      operation: 'chat',
      message_count: lcMessages.length,
    });

    const startTime = Date.now();
    try {
      const response = await llm.invoke(lcMessages);
      const usage = this.extractUsage(response);
      const result = response.content as string;

      await compressionCache.set(
        cacheKey,
        CacheKeyGenerator.generateHash(JSON.stringify({ messages, systemPrompt })),
        { result },
        1.0,
        usage.prompt_tokens || 0,
        usage.completion_tokens || 0,
        3600
      );

      logger.info({
        event: 'llm.call.completed',
        operation: 'chat',
        latency_ms: Date.now() - startTime,
        ...usage,
      });

      return result;
    } catch (err) {
      logger.error({
        event: 'llm.call.failed',
        operation: 'chat',
        latency_ms: Date.now() - startTime,
        error: String(err),
      });
      throw err;
    }
  }

  async *chatStream(messages: Message[], systemPrompt?: string): AsyncGenerator<string> {
    const llm = this.getLLM();
    const lcMessages = this.buildLLMMessages(messages, systemPrompt);

    logger.info({
      event: 'llm.call.started',
      operation: 'chat_stream',
      message_count: lcMessages.length,
    });

    const startTime = Date.now();
    try {
      for await (const chunk of await llm.stream(lcMessages)) {
        if (chunk.content) {
          yield chunk.content as string;
        }
      }

      logger.info({
        event: 'llm.call.completed',
        operation: 'chat_stream',
        latency_ms: Date.now() - startTime,
      });
    } catch (err) {
      logger.error({
        event: 'llm.call.failed',
        operation: 'chat_stream',
        latency_ms: Date.now() - startTime,
        error: String(err),
      });
      throw err;
    }
  }

  async chatWithHistory(
    userMessage: string,
    history: Message[],
    systemPrompt?: string
  ): Promise<string> {
    const messages = [...history, { role: 'user', content: userMessage }];
    return this.chat(messages, systemPrompt);
  }

  async structuredOutput<T>(
    messages: Message[],
    schema: Record<string, unknown>,
    systemPrompt?: string
  ): Promise<T> {
    const llm = this.getLLM();
    const structuredLLM = llm.withStructuredOutput(schema);
    const lcMessages = this.buildLLMMessages(messages, systemPrompt);

    logger.info({
      event: 'llm.call.started',
      operation: 'structured_output',
      message_count: lcMessages.length,
    });

    const startTime = Date.now();
    try {
      const response = await structuredLLM.invoke(lcMessages);

      logger.info({
        event: 'llm.call.completed',
        operation: 'structured_output',
        latency_ms: Date.now() - startTime,
      });

      return response as T;
    } catch (err) {
      logger.error({
        event: 'llm.call.failed',
        operation: 'structured_output',
        latency_ms: Date.now() - startTime,
        error: String(err),
      });
      throw err;
    }
  }
}

export const llmService = new LLMServiceImpl();
