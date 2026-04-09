"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolRegistry = void 0;
class ToolRegistryImpl {
    tools = new Map();
    register(tool) {
        this.tools.set(tool.name, tool);
    }
    get(name) {
        return this.tools.get(name);
    }
    list() {
        return Array.from(this.tools.values());
    }
    listByCategory(category) {
        return this.list().filter((t) => t.category === category);
    }
    has(name) {
        return this.tools.has(name);
    }
}
exports.toolRegistry = new ToolRegistryImpl();
//# sourceMappingURL=registry.js.map