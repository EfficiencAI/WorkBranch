interface WorkspaceInfo {
    id: string;
    session_id: string;
    status: string;
    created_at: string | null;
}
declare class WorkspaceServiceImpl {
    private baseDir;
    private workspaces;
    constructor();
    private ensureBaseDir;
    register(workspaceId?: string, sessionId?: string): string;
    getWorkspacePath(sessionId: string, workspaceId: string): string;
    getWorkspaceInfo(workspaceId: string): WorkspaceInfo | null;
    getWorkspaceDir(workspaceId: string): string | null;
    exists(workspaceId: string): boolean;
    listAll(): string[];
    validatePath(workspaceId: string, targetPath: string): {
        valid: boolean;
        path?: string;
        error?: string;
    };
    isPathAllowed(workspaceId: string, targetPath: string): boolean;
    resolvePath(workspaceId: string, relativePath: string): {
        valid: boolean;
        path?: string;
        error?: string;
    };
    deleteWorkspace(workspaceId: string): boolean;
    listSessions(): Record<string, string[]>;
}
export declare const workspaceService: WorkspaceServiceImpl;
export {};
//# sourceMappingURL=workspace-service.d.ts.map