import type { ToolDefinition, ToolResult, ToolExecutionContext } from './types';

export type { ToolDefinition, ToolResult, ToolExecutionContext };

class ToolRegistryImpl {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listByCategory(category: string): ToolDefinition[] {
    return this.list().filter((t) => t.category === category);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export const toolRegistry = new ToolRegistryImpl();
