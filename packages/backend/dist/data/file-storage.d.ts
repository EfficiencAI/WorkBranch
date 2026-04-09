export declare class FileStorage {
    constructor();
    getStorageRoot(): string;
    getSettingFilePath(): string;
    ensureSettingFile(defaultContent: Record<string, unknown>): boolean;
    readSettings(): Record<string, unknown>;
    writeSettings(data: Record<string, unknown>): void;
    ensureWorkspaceDir(workspaceId: string): string;
    readFile(filePath: string): string | null;
    writeFile(filePath: string, content: string): void;
    deleteFile(filePath: string): boolean;
    listFiles(dirPath: string): string[];
    fileExists(filePath: string): boolean;
}
export declare const fileStorage: FileStorage;
//# sourceMappingURL=file-storage.d.ts.map