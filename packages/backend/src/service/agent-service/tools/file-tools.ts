import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition, ToolResult, ToolExecutionContext } from './types';
import { toolRegistry } from './registry';
import { resolveWorkspacePath, getWorkspaceDir } from './executors';

function resolveToolPath(rawPath: string | undefined, workspaceId: string): { valid: boolean; path?: string; error?: string } {
  if (!rawPath) {
    const workspaceDir = getWorkspaceDir(workspaceId);
    if (!workspaceDir) {
      return { valid: false, error: `工作区不存在: ${workspaceId}` };
    }
    return { valid: true, path: workspaceDir };
  }
  return resolveWorkspacePath(workspaceId, rawPath);
}

async function executeReadFile(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const rawPath = (args.file_path || args.path) as string;
  if (!rawPath) {
    return { result: null, error: '缺少 file_path 参数' };
  }

  const resolved = resolveToolPath(rawPath, context.workspace_id);
  if (!resolved.valid || !resolved.path) {
    return { result: null, error: resolved.error || '路径解析失败' };
  }

  const filePath = resolved.path;
  const encoding = (args.encoding as BufferEncoding) || 'utf-8';
  const startLine = (args.start_line as number) || 1;
  const endLine = args.end_line as number | undefined;

  try {
    if (!fs.existsSync(filePath)) {
      return { result: null, error: `文件不存在: ${rawPath}` };
    }

    if (!fs.statSync(filePath).isFile()) {
      return { result: null, error: `路径不是文件: ${rawPath}` };
    }

    const content = fs.readFileSync(filePath, encoding);
    const lines = content.split('\n');

    const startIdx = Math.max(0, startLine - 1);
    const endIdx = endLine || lines.length;

    const selectedLines = lines.slice(startIdx, endIdx);
    const result = selectedLines.join('\n');

    return { result, error: null };
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

async function executeWriteFile(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const rawPath = (args.file_path || args.path) as string;
  if (!rawPath) {
    return { result: null, error: '缺少 file_path 参数' };
  }

  const resolved = resolveToolPath(rawPath, context.workspace_id);
  if (!resolved.valid || !resolved.path) {
    return { result: null, error: resolved.error || '路径解析失败' };
  }

  const filePath = resolved.path;
  const content = (args.content as string) || '';
  const mode = (args.mode as string) || 'write';
  const encoding = (args.encoding as BufferEncoding) || 'utf-8';

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const writeMode = mode === 'append' ? 'a' : 'w';
    fs.writeFileSync(filePath, content, { encoding, flag: writeMode });

    return { result: `文件写入成功: ${rawPath}`, error: null };
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

async function executeDeleteFile(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const rawPath = (args.file_path || args.path) as string;
  if (!rawPath) {
    return { result: null, error: '缺少 file_path 参数' };
  }

  const resolved = resolveToolPath(rawPath, context.workspace_id);
  if (!resolved.valid || !resolved.path) {
    return { result: null, error: resolved.error || '路径解析失败' };
  }

  const filePath = resolved.path;

  try {
    if (!fs.existsSync(filePath)) {
      return { result: null, error: `路径不存在: ${rawPath}` };
    }

    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      fs.unlinkSync(filePath);
      return { result: `文件删除成功: ${rawPath}`, error: null };
    } else if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
      return { result: `目录删除成功: ${rawPath}`, error: null };
    } else {
      return { result: null, error: `未知类型: ${rawPath}` };
    }
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

async function executeListDir(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const rawPath = (args.directory || args.path) as string;

  const resolved = resolveToolPath(rawPath || undefined, context.workspace_id);
  if (!resolved.valid || !resolved.path) {
    return { result: null, error: resolved.error || '路径解析失败' };
  }

  const targetDir = resolved.path;

  try {
    if (!fs.existsSync(targetDir)) {
      return { result: null, error: `目录不存在: ${rawPath || '.'}` };
    }

    if (!fs.statSync(targetDir).isDirectory()) {
      return { result: null, error: `路径不是目录: ${rawPath || '.'}` };
    }

    const recursive = (args.recursive as boolean) || false;
    const resultLines: string[] = [];

    if (recursive) {
      const walk = (dir: string, level: number = 0) => {
        const items = fs.readdirSync(dir);
        const indent = '  '.repeat(level);
        for (const item of items) {
          if (item.startsWith('.')) continue;
          const itemPath = path.join(dir, item);
          const isDir = fs.statSync(itemPath).isDirectory();
          resultLines.push(`${indent}${item}${isDir ? '/' : ''}`);
          if (isDir) {
            walk(itemPath, level + 1);
          }
        }
      };
      walk(targetDir);
    } else {
      const items = fs.readdirSync(targetDir);
      for (const item of items.sort()) {
        if (item.startsWith('.')) continue;
        const itemPath = path.join(targetDir, item);
        const isDir = fs.statSync(itemPath).isDirectory();
        resultLines.push(`${item}${isDir ? '/' : ''}`);
      }
    }

    return { result: resultLines.join('\n'), error: null };
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

async function executeCreateDir(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const rawPath = (args.directory || args.path) as string;
  if (!rawPath) {
    return { result: null, error: '缺少 directory 参数' };
  }

  const resolved = resolveToolPath(rawPath, context.workspace_id);
  if (!resolved.valid || !resolved.path) {
    return { result: null, error: resolved.error || '路径解析失败' };
  }

  const dirPath = resolved.path;

  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return { result: `目录创建成功: ${rawPath}`, error: null };
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

export function registerFileTools(): void {
  const tools: ToolDefinition[] = [
    {
      name: 'read_file',
      description: '读取工作区内的文件内容。file_path 为工作区内相对路径，不允许使用绝对路径。',
      params: 'read_file:{"file_path":"(工作区内相对路径)","start_line":"(第几行开始读，本参数可不填)","end_line":"(第几行结束读，本参数可不填)"}',
      category: 'file',
      executor: executeReadFile,
    },
    {
      name: 'write_file',
      description: '在工作区内写入文件。file_path 为工作区内相对路径，不允许使用绝对路径。如果目录不存在会自动创建。',
      params: 'write_file:{"file_path":"(工作区内相对路径)","content":"(写入内容)","mode":"(write或append，本参数可不填)"}',
      category: 'file',
      executor: executeWriteFile,
    },
    {
      name: 'delete_file',
      description: '删除工作区内的文件或目录。file_path 为工作区内相对路径，不允许使用绝对路径。',
      params: 'delete_file:{"file_path":"(工作区内相对路径)"}',
      category: 'file',
      executor: executeDeleteFile,
    },
    {
      name: 'list_dir',
      description: '列出工作区内目录的内容。directory 为工作区内相对路径，不允许使用绝对路径，默认为工作区根目录。',
      params: 'list_dir:{"directory":"(工作区内相对路径，本参数可不填)","recursive":"(是否递归，本参数可不填)"}',
      category: 'file',
      executor: executeListDir,
    },
    {
      name: 'create_dir',
      description: '在工作区内创建目录。directory 为工作区内相对路径，不允许使用绝对路径。',
      params: 'create_dir:{"directory":"(工作区内相对路径)"}',
      category: 'file',
      executor: executeCreateDir,
    },
  ];

  for (const tool of tools) {
    toolRegistry.register(tool);
  }
}
