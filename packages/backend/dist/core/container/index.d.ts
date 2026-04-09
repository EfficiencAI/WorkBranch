type Factory<T> = () => T;
declare class Container {
    private instances;
    private factories;
    register<T>(name: string, factory: Factory<T>): void;
    resolve<T>(name: string): T;
    clear(): void;
    has(name: string): boolean;
}
export declare const container: Container;
export declare function registerSingleton<T>(name: string, factory: Factory<T>): void;
export declare function resolve<T>(name: string): T;
export {};
//# sourceMappingURL=index.d.ts.map