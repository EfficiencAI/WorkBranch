"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
class WorkspaceServiceImpl {
    baseDir;
    workspaces = new Map();
    constructor() {
        this.baseDir = path.resolve('workspaces');
        this.ensureBaseDir();
    }
    ensureBaseDir() {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }
    register(workspaceId, sessionId) {
        const wid = workspaceId || (0, uuid_1.v4)().slice(0, 8);
        const sid = sessionId || (0, uuid_1.v4)().slice(0, 8);
        if (this.workspaces.has(wid)) {
            const existing = this.workspaces.get(wid);
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
    getWorkspacePath(sessionId, workspaceId) {
        return path.join(this.baseDir, sessionId, workspaceId);
    }
    getWorkspaceInfo(workspaceId) {
        return this.workspaces.get(workspaceId) || null;
    }
    getWorkspaceDir(workspaceId) {
        const info = this.workspaces.get(workspaceId);
        if (!info)
            return null;
        return this.getWorkspacePath(info.session_id, workspaceId);
    }
    exists(workspaceId) {
        return this.workspaces.has(workspaceId);
    }
    listAll() {
        return Array.from(this.workspaces.keys());
    }
    validatePath(workspaceId, targetPath) {
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
        }
        catch (err) {
            return { valid: false, error: `路径验证失败: ${err}` };
        }
    }
    isPathAllowed(workspaceId, targetPath) {
        return this.validatePath(workspaceId, targetPath).valid;
    }
    resolvePath(workspaceId, relativePath) {
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
    deleteWorkspace(workspaceId) {
        const info = this.workspaces.get(workspaceId);
        if (!info)
            return false;
        const workspacePath = this.getWorkspacePath(info.session_id, workspaceId);
        try {
            if (fs.existsSync(workspacePath)) {
                fs.rmSync(workspacePath, { recursive: true, force: true });
            }
            this.workspaces.delete(workspaceId);
            return true;
        }
        catch {
            return false;
        }
    }
    listSessions() {
        const sessions = {};
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
exports.workspaceService = new WorkspaceServiceImpl();
//# sourceMappingURL=workspace-service.js.map