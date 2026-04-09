export interface Workspace {
    id: string;
    name: string;
    path: string;
    createdAt: number;
    updatedAt: number;
}
export interface CreateWorkspaceRequest {
    name: string;
    path: string;
}
export interface WorkspaceInfo {
    id: string;
    session_id: string;
    status: string;
    created_at: string | null;
}
//# sourceMappingURL=workspace.d.ts.map