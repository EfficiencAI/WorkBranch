interface Message {
    role: string;
    content: string;
}
declare class LLMServiceImpl {
    private llm;
    private getLLM;
    private buildLLM;
    private buildLLMMessages;
    private extractUsage;
    chat(messages: Message[], systemPrompt?: string): Promise<string>;
    chatStream(messages: Message[], systemPrompt?: string): AsyncGenerator<string>;
    chatWithHistory(userMessage: string, history: Message[], systemPrompt?: string): Promise<string>;
    structuredOutput<T>(messages: Message[], schema: Record<string, unknown>, systemPrompt?: string): Promise<T>;
}
export declare const llmService: LLMServiceImpl;
export {};
//# sourceMappingURL=llm-service.d.ts.map