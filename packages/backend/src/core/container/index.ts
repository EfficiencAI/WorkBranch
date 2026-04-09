type Factory<T> = () => T;

class Container {
  private instances: Map<string, unknown> = new Map();
  private factories: Map<string, Factory<unknown>> = new Map();

  register<T>(name: string, factory: Factory<T>): void {
    this.factories.set(name, factory as Factory<unknown>);
  }

  resolve<T>(name: string): T {
    if (this.instances.has(name)) {
      return this.instances.get(name) as T;
    }

    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`No factory registered for: ${name}`);
    }

    const instance = factory();
    this.instances.set(name, instance);
    return instance as T;
  }

  clear(): void {
    this.instances.clear();
    this.factories.clear();
  }

  has(name: string): boolean {
    return this.factories.has(name) || this.instances.has(name);
  }
}

export const container = new Container();

export function registerSingleton<T>(name: string, factory: Factory<T>): void {
  container.register(name, factory);
}

export function resolve<T>(name: string): T {
  return container.resolve<T>(name);
}
