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

export interface WorkspaceDetail {
  id: string;
  sessionId: string | number;
  status?: string | null;
  createdAt?: string | null;
  dir?: string | null;
}
