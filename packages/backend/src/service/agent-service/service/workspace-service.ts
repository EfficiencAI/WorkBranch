import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface WorkspaceInfo {
  id: string;
  session_id: string;
  status: string;
  created_at: string | null;
}

class WorkspaceServiceImpl {
  private baseDir: string;
  private workspaces: Map<string, WorkspaceInfo> = new Map();

  constructor() {
    this.baseDir = path.resolve('workspaces');
    this.ensureBaseDir();
  }

  private ensureBaseDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  register(workspaceId?: string, sessionId?: string): string {
    const wid = workspaceId || uuidv4().slice(0, 8);
    const sid = sessionId || uuidv4().slice(0, 8);

    if (this.workspaces.has(wid)) {
      const existing = this.workspaces.get(wid)!;
      if (existing.session_id === sid) {
        return wid;
      }
    }

    this.workspaces.set(wid, {
      id: wid,
      session_id: sid,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    const workspacePath = this.getWorkspacePath(sid, wid);
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    return wid;
  }

  getWorkspacePath(sessionId: string, workspaceId: string): string {
    return path.join(this.baseDir, sessionId, workspaceId);
  }

  getWorkspaceInfo(workspaceId: string): WorkspaceInfo | null {
    return this.workspaces.get(workspaceId) || null;
  }

  getWorkspaceDir(workspaceId: string): string | null {
    const info = this.workspaces.get(workspaceId);
    if (!info) return null;
    return this.getWorkspacePath(info.session_id, workspaceId);
  }

  exists(workspaceId: string): boolean {
    return this.workspaces.has(workspaceId);
  }

  listAll(): string[] {
    return Array.from(this.workspaces.keys());
  }

  validatePath(workspaceId: string, targetPath: string): { valid: boolean; path?: string; error?: string } {
    const workspaceDir = this.getWorkspaceDir(workspaceId);
    if (!workspaceDir) {
      return { valid: false, error: `工作区不存在: ${workspaceId}` };
    }

    try {
      const absTarget = path.resolve(targetPath);
      const absWorkspace = path.resolve(workspaceDir);

      if (!absTarget.startsWith(absWorkspace + path.sep) && absTarget !== absWorkspace) {
        return { valid: false, error: `路径越界: ${targetPath} 不在工作区 ${workspaceDir} 范围内` };
      }

      return { valid: true, path: absTarget };
    } catch (err) {
      return { valid: false, error: `路径验证失败: ${err}` };
    }
  }

  isPathAllowed(workspaceId: string, targetPath: string): boolean {
    return this.validatePath(workspaceId, targetPath).valid;
  }

  resolvePath(workspaceId: string, relativePath: string): { valid: boolean; path?: string; error?: string } {
    const workspaceDir = this.getWorkspaceDir(workspaceId);
    if (!workspaceDir) {
      return { valid: false, error: `工作区不存在: ${workspaceId}` };
    }

    if (path.isAbsolute(relativePath)) {
      return this.validatePath(workspaceId, relativePath);
    }

    const fullPath = path.join(workspaceDir, relativePath);
    return this.validatePath(workspaceId, fullPath);
  }

  deleteWorkspace(workspaceId: string): boolean {
    const info = this.workspaces.get(workspaceId);
    if (!info) return false;

    const workspacePath = this.getWorkspacePath(info.session_id, workspaceId);

    try {
      if (fs.existsSync(workspacePath)) {
        fs.rmSync(workspacePath, { recursive: true, force: true });
      }
      this.workspaces.delete(workspaceId);
      return true;
    } catch {
      return false;
    }
  }

  listSessions(): Record<string, string[]> {
    const sessions: Record<string, string[]> = {};
    for (const [wid, info] of this.workspaces) {
      const sid = info.session_id || 'unknown';
      if (!sessions[sid]) {
        sessions[sid] = [];
      }
      sessions[sid].push(wid);
    }
    return sessions;
  }
}

export const workspaceService = new WorkspaceServiceImpl();
