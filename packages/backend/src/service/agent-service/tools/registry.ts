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

  generateToolPrompt(allowedTools: string[]): string {
    if (!allowedTools || allowedTools.length === 0) {
      return '当前没有可用工具。';
    }

    const lines = ['## 工具列表'];
    for (const name of allowedTools) {
      const tool = this.tools.get(name);
      if (tool && tool.params) {
        lines.push(tool.params);
      }
    }

    return lines.join('\n');
  }
}

export const toolRegistry = new ToolRegistryImpl();
