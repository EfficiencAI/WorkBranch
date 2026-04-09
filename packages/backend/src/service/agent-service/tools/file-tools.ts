import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition, ToolResult } from './registry';
import { toolRegistry } from './registry';

async function executeReadFile(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = (args.file_path || args.path) as string;
  if (!filePath) {
    return { result: null, error: '缺少 file_path 参数' };
  }

  const encoding = (args.encoding as BufferEncoding) || 'utf-8';
  const startLine = (args.start_line as number) || 1;
  const endLine = args.end_line as number | undefined;

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
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

async function executeWriteFile(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = (args.file_path || args.path) as string;
  if (!filePath) {
    return { result: null, error: '缺少 file_path 参数' };
  }

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

    return { result: `文件写入成功: ${filePath}`, error: null };
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

async function executeDeleteFile(args: Record<string, unknown>): Promise<ToolResult> {
  const filePath = (args.file_path || args.path) as string;
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
    } else if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
      return { result: `目录删除成功: ${filePath}`, error: null };
    } else {
      return { result: null, error: `未知类型: ${filePath}` };
    }
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

async function executeListDir(args: Record<string, unknown>): Promise<ToolResult> {
  const directory = (args.directory || args.path || '.') as string;
  const recursive = (args.recursive as boolean) || false;

  try {
    if (!fs.existsSync(directory)) {
      return { result: null, error: `目录不存在: ${directory}` };
    }

    if (!fs.statSync(directory).isDirectory()) {
      return { result: null, error: `路径不是目录: ${directory}` };
    }

    const resultLines: string[] = [];

    if (recursive) {
      const walk = (dir: string, level: number = 0) => {
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
    } else {
      const items = fs.readdirSync(directory);
      for (const item of items.sort()) {
        const itemPath = path.join(directory, item);
        const isDir = fs.statSync(itemPath).isDirectory();
        resultLines.push(`${item}${isDir ? '/' : ''}`);
      }
    }

    return { result: resultLines.join('\n'), error: null };
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

async function executeCreateDir(args: Record<string, unknown>): Promise<ToolResult> {
  const directory = (args.directory || args.path) as string;
  if (!directory) {
    return { result: null, error: '缺少 directory 参数' };
  }

  try {
    fs.mkdirSync(directory, { recursive: true });
    return { result: `目录创建成功: ${directory}`, error: null };
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

export function registerFileTools(): void {
  const tools: ToolDefinition[] = [
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
    toolRegistry.register(tool);
  }
}
