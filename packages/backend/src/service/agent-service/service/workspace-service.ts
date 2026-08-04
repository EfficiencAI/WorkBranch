import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileStorage } from '../../../data/file-storage';

interface WorkspaceInfo {
  id: string;
  session_id: string;
  status: string;
  created_at: string | null;
}

export interface FileInfo {
  name: string;
  path: string;
  absolutePath: string;
  size: number;
  type: string;
  modifiedAt: string;
  isDirectory: boolean;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  type?: string;
  modifiedAt?: string;
  children?: FileTreeNode[];
}

const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.tsx': 'application/typescript',
    '.jsx': 'application/javascript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.xml': 'application/xml',
    '.yaml': 'application/x-yaml',
    '.yml': 'application/x-yaml',
    '.csv': 'text/csv',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.rar': 'application/vnd.rar',
    '.7z': 'application/x-7z-compressed',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.py': 'text/x-python',
    '.java': 'text/x-java-source',
    '.c': 'text/x-c',
    '.cpp': 'text/x-c++src',
    '.h': 'text/x-c',
    '.hpp': 'text/x-c++hdr',
    '.rs': 'text/x-rust',
    '.go': 'text/x-go',
    '.rb': 'text/x-ruby',
    '.php': 'text/x-php',
    '.swift': 'text/x-swift',
    '.kt': 'text/x-kotlin',
    '.scala': 'text/x-scala',
    '.sh': 'application/x-sh',
    '.bash': 'application/x-sh',
    '.ps1': 'application/x-powershell',
    '.sql': 'application/x-sql',
    '.db': 'application/x-sqlite3',
    '.sqlite': 'application/x-sqlite3',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function isHiddenFile(filename: string): boolean {
  return filename.startsWith('.');
}

function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const textExtensions = [
    '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.xml',
    '.yaml', '.yml', '.csv', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.rs',
    '.go', '.rb', '.php', '.swift', '.kt', '.scala', '.sh', '.bash', '.ps1', '.sql',
    '.log', '.ini', '.cfg', '.conf', '.env', '.gitignore', '.dockerignore',
    '.editorconfig', '.eslintrc', '.prettierrc', '.babelrc', '.tsconfig',
  ];
  return !textExtensions.includes(ext);
}

class WorkspaceServiceImpl {
  private baseDir: string;
  private workspaces: Map<string, WorkspaceInfo> = new Map();

  constructor() {
    this.baseDir = path.join(fileStorage.getStorageRoot(), 'workspaces');
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

  getWorkspaceBySessionId(sessionId: string): WorkspaceInfo | null {
    for (const info of this.workspaces.values()) {
      if (info.session_id === sessionId) {
        return info;
      }
    }
    return null;
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

  listFiles(workspaceId: string): { success: boolean; files: Array<{ name: string; path: string; is_dir: boolean; size: number; modified_at: string }>; error: string } {
    const workspaceDir = this.getWorkspaceDir(workspaceId);
    if (!workspaceDir) {
      return { success: false, files: [], error: `工作区不存在: ${workspaceId}` };
    }

    if (!fs.existsSync(workspaceDir)) {
      return { success: true, files: [], error: '' };
    }

    const files: Array<{ name: string; path: string; is_dir: boolean; size: number; modified_at: string }> = [];

    try {
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(workspaceDir, fullPath).replace(/\\/g, '/');
          const stat = fs.statSync(fullPath);
          if (entry.isDirectory()) {
            files.push({
              name: entry.name,
              path: relPath,
              is_dir: true,
              size: 0,
              modified_at: stat.mtime.toISOString(),
            });
            walk(fullPath);
          } else {
            files.push({
              name: entry.name,
              path: relPath,
              is_dir: false,
              size: stat.size,
              modified_at: stat.mtime.toISOString(),
            });
          }
        }
      };
      walk(workspaceDir);

      files.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.path.toLowerCase().localeCompare(b.path.toLowerCase());
      });

      return { success: true, files, error: '' };
    } catch (e) {
      return { success: false, files: [], error: `列出文件失败: ${String(e)}` };
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

  private _getUniqueFilename(dir: string, filename: string): string {
    if (!fs.existsSync(path.join(dir, filename))) {
      return filename;
    }

    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let counter = 1;

    while (fs.existsSync(path.join(dir, `${base}_${counter}${ext}`))) {
      counter++;
    }

    return `${base}_${counter}${ext}`;
  }

  async saveUploadedFiles(
    workspaceId: string,
    files: Array<{ filename: string; content: Buffer }>,
    subDir?: string
  ): Promise<{ success: boolean; files: Array<{ original_filename: string; saved_as: string; path: string; size: number }>; error: string }> {
    const workspaceDir = this.getWorkspaceDir(workspaceId);
    if (!workspaceDir) {
      return {
        success: false,
        files: [],
        error: `工作区不存在: ${workspaceId}`,
      };
    }

    let targetDir = workspaceDir;
    if (subDir) {
      const resolved = this.resolvePath(workspaceId, subDir);
      if (!resolved.valid) {
        return {
          success: false,
          files: [],
          error: `无效的子目录路径: ${subDir}`,
        };
      }
      targetDir = resolved.path!;
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }

    const savedFiles: Array<{ original_filename: string; saved_as: string; path: string; size: number }> = [];

    try {
      for (const file of files) {
        const uniqueFilename = this._getUniqueFilename(targetDir, file.filename);
        const filePath = path.join(targetDir, uniqueFilename);

        fs.writeFileSync(filePath, file.content);

        savedFiles.push({
          original_filename: file.filename,
          saved_as: uniqueFilename,
          path: filePath,
          size: file.content.length,
        });
      }

      return {
        success: true,
        files: savedFiles,
        error: '',
      };
    } catch (err) {
      return {
        success: false,
        files: savedFiles,
        error: String(err),
      };
    }
  }

  getFileTree(workspaceId: string): { success: boolean; tree?: FileTreeNode; error?: string } {
    const workspaceDir = this.getWorkspaceDir(workspaceId);
    if (!workspaceDir) {
      return { success: false, error: `工作区不存在: ${workspaceId}` };
    }

    if (!fs.existsSync(workspaceDir)) {
      return { success: false, error: `工作区目录不存在` };
    }

    const buildTree = (dir: string, relativePath: string): FileTreeNode | null => {
      const items = fs.readdirSync(dir);
      const filteredItems = items.filter(item => !isHiddenFile(item));

      const children: FileTreeNode[] = [];

      for (const item of filteredItems) {
        const itemPath = path.join(dir, item);
        const itemRelativePath = relativePath ? `${relativePath}/${item}` : item;
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          const childNode = buildTree(itemPath, itemRelativePath);
          if (childNode) {
            children.push(childNode);
          }
        } else {
          children.push({
            name: item,
            path: itemRelativePath,
            isDirectory: false,
            size: stats.size,
            type: getMimeType(itemPath),
            modifiedAt: stats.mtime.toISOString(),
          });
        }
      }

      children.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return {
        name: path.basename(dir),
        path: relativePath,
        isDirectory: true,
        children,
      };
    };

    const tree = buildTree(workspaceDir, '');
    return { success: true, tree: tree || undefined };
  }

  getFileInfo(workspaceId: string, relativePath: string): { success: boolean; info?: FileInfo; error?: string } {
    const resolved = this.resolvePath(workspaceId, relativePath);
    if (!resolved.valid) {
      return { success: false, error: resolved.error };
    }

    const absolutePath = resolved.path!;
    if (!fs.existsSync(absolutePath)) {
      return { success: false, error: `文件不存在: ${relativePath}` };
    }

    const stats = fs.statSync(absolutePath);
    const workspaceDir = this.getWorkspaceDir(workspaceId)!;
    const normalizedRelativePath = path.relative(workspaceDir, absolutePath).replace(/\\/g, '/');

    return {
      success: true,
      info: {
        name: path.basename(absolutePath),
        path: normalizedRelativePath,
        absolutePath,
        size: stats.isDirectory() ? 0 : stats.size,
        type: stats.isDirectory() ? 'directory' : getMimeType(absolutePath),
        modifiedAt: stats.mtime.toISOString(),
        isDirectory: stats.isDirectory(),
      },
    };
  }

  getFileContent(workspaceId: string, relativePath: string): { success: boolean; content?: string; encoding?: string; size?: number; error?: string } {
    const resolved = this.resolvePath(workspaceId, relativePath);
    if (!resolved.valid) {
      return { success: false, error: resolved.error };
    }

    const absolutePath = resolved.path!;

    if (!fs.existsSync(absolutePath)) {
      return { success: false, error: `文件不存在: ${relativePath}` };
    }

    const stats = fs.statSync(absolutePath);
    if (stats.isDirectory()) {
      return { success: false, error: `不能读取目录内容: ${relativePath}` };
    }

    if (stats.size > MAX_FILE_SIZE) {
      return { success: false, error: `文件过大，超过 1GB 限制: ${relativePath}` };
    }

    const isBinary = isBinaryFile(absolutePath);

    try {
      if (isBinary) {
        const buffer = fs.readFileSync(absolutePath);
        return {
          success: true,
          content: buffer.toString('base64'),
          encoding: 'base64',
          size: stats.size,
        };
      } else {
        const content = fs.readFileSync(absolutePath, 'utf-8');
        return {
          success: true,
          content,
          encoding: 'utf-8',
          size: stats.size,
        };
      }
    } catch (err) {
      return { success: false, error: `读取文件失败: ${err}` };
    }
  }

  deleteFile(workspaceId: string, relativePath: string): { success: boolean; deleted?: boolean; path?: string; error?: string } {
    const resolved = this.resolvePath(workspaceId, relativePath);
    if (!resolved.valid) {
      return { success: false, error: resolved.error };
    }

    const absolutePath = resolved.path!;

    if (!fs.existsSync(absolutePath)) {
      return { success: false, error: `文件不存在: ${relativePath}` };
    }

    try {
      const stats = fs.statSync(absolutePath);
      if (stats.isDirectory()) {
        fs.rmSync(absolutePath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(absolutePath);
      }
      return { success: true, deleted: true, path: relativePath };
    } catch (err) {
      return { success: false, error: `删除失败: ${err}` };
    }
  }
}

export const workspaceService = new WorkspaceServiceImpl();
