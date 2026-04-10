export declare class SettingsService {
    private data;
    constructor();
    private reload;
    private persist;
    get(key: string): unknown;
    getAll(): Record<string, unknown>;
    getMetadata(): Record<string, unknown>;
    updateSetting(key: string, value: unknown): boolean;
    updateSettings(updates: Record<string, unknown>): boolean;
    forceReload(): void;
}
export declare const settingsService: SettingsService;
//# sourceMappingURL=settings-service.d.ts.map