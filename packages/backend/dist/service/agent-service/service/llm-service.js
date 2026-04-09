"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmService = void 0;
const openai_1 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const settings_service_1 = require("../../settings-service");
const logging_1 = require("../../../core/logging");
class LLMServiceImpl {
    llm = null;
    getLLM() {
        if (!this.llm) {
            this.llm = this.buildLLM();
        }
        return this.llm;
    }
    buildLLM() {
        const apiKey = settings_service_1.settingsService.get('llm:api_key');
        const baseUrl = settings_service_1.settingsService.get('llm:base_url');
        const model = settings_service_1.settingsService.get('llm:model');
        const temperature = settings_service_1.settingsService.get('llm:temperature');
        const maxTokens = settings_service_1.settingsService.get('llm:max_tokens');
        if (!apiKey) {
            throw new Error('LLM API key not configured. Please set llm:api_key in settings.');
        }
        return new openai_1.ChatOpenAI({
            openAIApiKey: apiKey,
            configuration: {
                baseURL: baseUrl,
            },
            modelName: model,
            temperature,
            maxTokens,
            timeout: 120000,
        });
    }
    buildLLMMessages(messages, systemPrompt) {
        const lcMessages = [];
        if (systemPrompt) {
            lcMessages.push(new messages_1.SystemMessage(systemPrompt));
        }
        for (const msg of messages) {
            const role = msg.role || 'user';
            const content = msg.content || '';
            if (role === 'user') {
                lcMessages.push(new messages_1.HumanMessage(content));
            }
            else if (role === 'assistant') {
                lcMessages.push(new messages_1.AIMessage(content));
            }
            else if (role === 'system') {
                lcMessages.push(new messages_1.SystemMessage(content));
            }
        }
        return lcMessages;
    }
    extractUsage(result) {
        const anyResult = result;
        const usageMetadata = anyResult?.usage_metadata;
        const responseMetadata = anyResult?.response_metadata;
        let usage = usageMetadata;
        if (!usage && responseMetadata) {
            usage = responseMetadata.token_usage;
        }
        if (!usage)
            return {};
        const promptTokens = usage.input_tokens ?? usage.prompt_tokens;
        const completionTokens = usage.output_tokens ?? usage.completion_tokens;
        const totalTokens = usage.total_tokens;
        return {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens ?? (promptTokens && completionTokens ? promptTokens + completionTokens : undefined),
        };
    }
    async chat(messages, systemPrompt) {
        const llm = this.getLLM();
        const lcMessages = this.buildLLMMessages(messages, systemPrompt);
        logging_1.logger.info({
            event: 'llm.call.started',
            operation: 'chat',
            message_count: lcMessages.length,
        });
        const startTime = Date.now();
        try {
            const response = await llm.invoke(lcMessages);
            const usage = this.extractUsage(response);
            logging_1.logger.info({
                event: 'llm.call.completed',
                operation: 'chat',
                latency_ms: Date.now() - startTime,
                ...usage,
            });
            return response.content;
        }
        catch (err) {
            logging_1.logger.error({
                event: 'llm.call.failed',
                operation: 'chat',
                latency_ms: Date.now() - startTime,
                error: String(err),
            });
            throw err;
        }
    }
    async *chatStream(messages, systemPrompt) {
        const llm = this.getLLM();
        const lcMessages = this.buildLLMMessages(messages, systemPrompt);
        logging_1.logger.info({
            event: 'llm.call.started',
            operation: 'chat_stream',
            message_count: lcMessages.length,
        });
        const startTime = Date.now();
        try {
            for await (const chunk of await llm.stream(lcMessages)) {
                if (chunk.content) {
                    yield chunk.content;
                }
            }
            logging_1.logger.info({
                event: 'llm.call.completed',
                operation: 'chat_stream',
                latency_ms: Date.now() - startTime,
            });
        }
        catch (err) {
            logging_1.logger.error({
                event: 'llm.call.failed',
                operation: 'chat_stream',
                latency_ms: Date.now() - startTime,
                error: String(err),
            });
            throw err;
        }
    }
    async chatWithHistory(userMessage, history, systemPrompt) {
        const messages = [...history, { role: 'user', content: userMessage }];
        return this.chat(messages, systemPrompt);
    }
    async structuredOutput(messages, schema, systemPrompt) {
        const llm = this.getLLM();
        const structuredLLM = llm.withStructuredOutput(schema);
        const lcMessages = this.buildLLMMessages(messages, systemPrompt);
        logging_1.logger.info({
            event: 'llm.call.started',
            operation: 'structured_output',
            message_count: lcMessages.length,
        });
        const startTime = Date.now();
        try {
            const response = await structuredLLM.invoke(lcMessages);
            logging_1.logger.info({
                event: 'llm.call.completed',
                operation: 'structured_output',
                latency_ms: Date.now() - startTime,
            });
            return response;
        }
        catch (err) {
            logging_1.logger.error({
                event: 'llm.call.failed',
                operation: 'structured_output',
                latency_ms: Date.now() - startTime,
                error: String(err),
            });
            throw err;
        }
    }
}
exports.llmService = new LLMServiceImpl();
//# sourceMappingURL=llm-service.js.map