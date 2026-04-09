export interface ToolDefinition {
    name: string;
    description: string;
    params: string;
    category: string;
    executor: (args: Record<string, unknown>) => Promise<ToolResult>;
}
export interface ToolResult {
    result: unknown;
    error: string | null;
}
declare class ToolRegistryImpl {
    private tools;
    register(tool: ToolDefinition): void;
    get(name: string): ToolDefinition | undefined;
    list(): ToolDefinition[];
    listByCategory(category: string): ToolDefinition[];
    has(name: string): boolean;
}
export declare const toolRegistry: ToolRegistryImpl;
export {};
//# sourceMappingURL=registry.d.ts.map