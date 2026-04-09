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
exports.registerFileTools = registerFileTools;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const registry_1 = require("./registry");
async function executeReadFile(args) {
    const filePath = (args.file_path || args.path);
    if (!filePath) {
        return { result: null, error: '缺少 file_path 参数' };
    }
    const encoding = args.encoding || 'utf-8';
    const startLine = args.start_line || 1;
    const endLine = args.end_line;
    try {
        if (!fs.existsSync(filePath)) {
            return { result: null, error: `文件不存在: ${filePath}` };
        }
        if (!fs.statSync(filePath).isFile()) {
            return { result: null, error: `路径不是文件: ${filePath}` };
        }
        const content = fs.readFileSync(filePath, encoding);
        const lines = content.split('\n');
        const startIdx = Math.max(0, startLine - 1);
        const endIdx = endLine || lines.length;
        const selectedLines = lines.slice(startIdx, endIdx);
        const result = selectedLines.join('\n');
        return { result, error: null };
    }
    catch (err) {
        return { result: null, error: String(err) };
    }
}
async function executeWriteFile(args) {
    const filePath = (args.file_path || args.path);
    if (!filePath) {
        return { result: null, error: '缺少 file_path 参数' };
    }
    const content = args.content || '';
    const mode = args.mode || 'write';
    const encoding = args.encoding || 'utf-8';
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const writeMode = mode === 'append' ? 'a' : 'w';
        fs.writeFileSync(filePath, content, { encoding, flag: writeMode });
        return { result: `文件写入成功: ${filePath}`, error: null };
    }
    catch (err) {
        return { result: null, error: String(err) };
    }
}
async function executeDeleteFile(args) {
    const filePath = (args.file_path || args.path);
    if (!filePath) {
        return { result: null, error: '缺少 file_path 参数' };
    }
    try {
        if (!fs.existsSync(filePath)) {
            return { result: null, error: `路径不存在: ${filePath}` };
        }
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
            fs.unlinkSync(filePath);
            return { result: `文件删除成功: ${filePath}`, error: null };
        }
        else if (stat.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
            return { result: `目录删除成功: ${filePath}`, error: null };
        }
        else {
            return { result: null, error: `未知类型: ${filePath}` };
        }
    }
    catch (err) {
        return { result: null, error: String(err) };
    }
}
async function executeListDir(args) {
    const directory = (args.directory || args.path || '.');
    const recursive = args.recursive || false;
    try {
        if (!fs.existsSync(directory)) {
            return { result: null, error: `目录不存在: ${directory}` };
        }
        if (!fs.statSync(directory).isDirectory()) {
            return { result: null, error: `路径不是目录: ${directory}` };
        }
        const resultLines = [];
        if (recursive) {
            const walk = (dir, level = 0) => {
                const items = fs.readdirSync(dir);
                const indent = '  '.repeat(level);
                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    const isDir = fs.statSync(itemPath).isDirectory();
                    resultLines.push(`${indent}${item}${isDir ? '/' : ''}`);
                    if (isDir) {
                        walk(itemPath, level + 1);
                    }
                }
            };
            walk(directory);
        }
        else {
            const items = fs.readdirSync(directory);
            for (const item of items.sort()) {
                const itemPath = path.join(directory, item);
                const isDir = fs.statSync(itemPath).isDirectory();
                resultLines.push(`${item}${isDir ? '/' : ''}`);
            }
        }
        return { result: resultLines.join('\n'), error: null };
    }
    catch (err) {
        return { result: null, error: String(err) };
    }
}
async function executeCreateDir(args) {
    const directory = (args.directory || args.path);
    if (!directory) {
        return { result: null, error: '缺少 directory 参数' };
    }
    try {
        fs.mkdirSync(directory, { recursive: true });
        return { result: `目录创建成功: ${directory}`, error: null };
    }
    catch (err) {
        return { result: null, error: String(err) };
    }
}
function registerFileTools() {
    const tools = [
        {
            name: 'read_file',
            description: '读取文件内容',
            params: 'file_path, start_line, end_line',
            category: 'file',
            executor: executeReadFile,
        },
        {
            name: 'write_file',
            description: '写入文件',
            params: 'file_path, content, mode(write/append)',
            category: 'file',
            executor: executeWriteFile,
        },
        {
            name: 'delete_file',
            description: '删除文件或目录',
            params: 'file_path',
            category: 'file',
            executor: executeDeleteFile,
        },
        {
            name: 'list_dir',
            description: '列出目录内容',
            params: 'directory, recursive',
            category: 'file',
            executor: executeListDir,
        },
        {
            name: 'create_dir',
            description: '创建目录',
            params: 'directory',
            category: 'file',
            executor: executeCreateDir,
        },
    ];
    for (const tool of tools) {
        registry_1.toolRegistry.register(tool);
    }
}
//# sourceMappingURL=file-tools.js.map