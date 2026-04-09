"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.container = void 0;
exports.registerSingleton = registerSingleton;
exports.resolve = resolve;
class Container {
    instances = new Map();
    factories = new Map();
    register(name, factory) {
        this.factories.set(name, factory);
    }
    resolve(name) {
        if (this.instances.has(name)) {
            return this.instances.get(name);
        }
        const factory = this.factories.get(name);
        if (!factory) {
            throw new Error(`No factory registered for: ${name}`);
        }
        const instance = factory();
        this.instances.set(name, instance);
        return instance;
    }
    clear() {
        this.instances.clear();
        this.factories.clear();
    }
    has(name) {
        return this.factories.has(name) || this.instances.has(name);
    }
}
exports.container = new Container();
function registerSingleton(name, factory) {
    exports.container.register(name, factory);
}
function resolve(name) {
    return exports.container.resolve(name);
}
//# sourceMappingURL=index.js.map