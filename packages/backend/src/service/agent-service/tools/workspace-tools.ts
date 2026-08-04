import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition, ToolResult, ToolExecutionContext } from './types';
import { toolRegistry } from './registry';
import { workspaceService } from '../service/workspace-service';

async function executeListWorkspaceFiles(_args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const workspaceId = context.workspace_id;
  const result = workspaceService.listFiles(workspaceId);

  if (!result.success) {
    return { result: null, error: result.error };
  }

  if (result.files.length === 0) {
    return { result: '工作区为空，暂无文件', error: null };
  }

  const resultLines = ['工作区文件列表：\n'];
  for (const f of result.files) {
    const icon = f.is_dir ? '📁' : '📄';
    const sizeStr = f.is_dir ? '' : ` (${formatFileSize(f.size)})`;
    resultLines.push(`  ${icon} ${f.path}${sizeStr}`);
  }

  return { result: resultLines.join('\n'), error: null };
}

async function executeGetWorkspaceInfo(_args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const workspaceId = context.workspace_id;
  const info = workspaceService.getWorkspaceInfo(workspaceId);

  if (!info) {
    return { result: null, error: `工作区不存在: ${workspaceId}` };
  }

  const workspaceDir = workspaceService.getWorkspaceDir(workspaceId);

  const resultLines = [
    '工作区信息：',
    `  ID: ${info.id}`,
    `  会话ID: ${info.session_id}`,
    `  状态: ${info.status}`,
    `  路径: ${workspaceDir}`,
  ];

  if (workspaceDir && fs.existsSync(workspaceDir)) {
    let totalSize = 0;
    let fileCount = 0;
    let dirCount = 0;
    const walkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          dirCount++;
          walkDir(fullPath);
        } else {
          fileCount++;
          totalSize += fs.statSync(fullPath).size;
        }
      }
    };
    walkDir(workspaceDir);
    resultLines.push(
      `  文件数: ${fileCount}`,
      `  目录数: ${dirCount}`,
      `  总大小: ${formatFileSize(totalSize)}`,
    );
  }

  return { result: resultLines.join('\n'), error: null };
}

async function executeGetFileTree(_args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const result = workspaceService.getFileTree(context.workspace_id);

  if (!result.success) {
    return { result: null, error: result.error ?? 'Unknown error' };
  }

  return { result: result.tree, error: null };
}

async function executeSearchFiles(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const pattern = (args.pattern || args.query || '*') as string;
  const workspaceDir = workspaceService.getWorkspaceDir(context.workspace_id);
  if (!workspaceDir) {
    return { result: null, error: `工作区不存在: ${context.workspace_id}` };
  }

  if (!fs.existsSync(workspaceDir)) {
    return { result: '工作区为空', error: null };
  }

  const matches: Array<{ name: string; path: string; size?: number; is_dir?: boolean }> = [];

  const walkDir = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(workspaceDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (fnmatch(pattern.toLowerCase(), entry.name.toLowerCase())) {
          matches.push({ name: entry.name, path: relPath, is_dir: true });
        }
        walkDir(fullPath);
      } else {
        if (fnmatch(pattern.toLowerCase(), entry.name.toLowerCase())) {
          matches.push({ name: entry.name, path: relPath, size: fs.statSync(fullPath).size });
        }
      }
    }
  };

  walkDir(workspaceDir);

  if (matches.length === 0) {
    return { result: `未找到匹配 '${pattern}' 的文件`, error: null };
  }

  const resultLines = [`找到 ${matches.length} 个匹配 '${pattern}' 的结果：\n`];
  for (const m of matches) {
    const icon = m.is_dir ? '📁' : '📄';
    const sizeStr = m.is_dir ? '' : ` (${formatFileSize(m.size!)})`;
    resultLines.push(`  ${icon} ${m.path}${sizeStr}`);
  }

  return { result: resultLines.join('\n'), error: null };
}

function fnmatch(pattern: string, name: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexStr}$`).test(name);
}

async function executeGlobFiles(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const pattern = (args.pattern || args.glob) as string;
  if (!pattern) {
    return { result: null, error: '缺少 pattern 参数' };
  }

  const workspaceDir = workspaceService.getWorkspaceDir(context.workspace_id);
  if (!workspaceDir) {
    return { result: null, error: `Workspace not found: ${context.workspace_id}` };
  }

  if (!fs.existsSync(workspaceDir)) {
    return { result: [], error: null };
  }

  const results: string[] = [];
  const maxResults = (args.max_results as number) || 100;

  const walk = (dir: string, baseDir: string) => {
    if (results.length >= maxResults) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item.startsWith('.')) continue;
      if (results.length >= maxResults) break;

      const itemPath = path.join(dir, item);
      const relativePath = path.relative(baseDir, itemPath).replace(/\\/g, '/');
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        walk(itemPath, baseDir);
      } else if (stat.isFile()) {
        if (fnmatch(pattern.toLowerCase(), item.toLowerCase())) {
          results.push(relativePath);
        }
      }
    }
  };

  walk(workspaceDir, workspaceDir);

  return { result: results, error: null };
}

function formatFileSize(size: number): string {
  for (const unit of ['B', 'KB', 'MB', 'GB']) {
    if (size < 1024) {
      return `${size.toFixed(1)} ${unit}`;
    }
    size /= 1024;
  }
  return `${size.toFixed(1)} TB`;
}

export function registerWorkspaceTools(): void {
  const tools: ToolDefinition[] = [
    {
      name: 'list_workspace_files',
      description: '列出工作区内所有文件和目录。',
      params: 'list_workspace_files:{}',
      category: 'workspace',
      executor: executeListWorkspaceFiles,
    },
    {
      name: 'get_workspace_info',
      description: '获取当前工作区的基本信息，包括目录路径、文件统计等。',
      params: 'get_workspace_info:{}',
      category: 'workspace',
      executor: executeGetWorkspaceInfo,
    },
    {
      name: 'get_file_tree',
      description: '获取工作区的完整文件树结构，包括所有文件和目录。',
      params: 'get_file_tree:{}',
      category: 'workspace',
      executor: executeGetFileTree,
    },
    {
      name: 'search_files',
      description: '在工作区内按文件名模式搜索文件。支持通配符 * 和 ?。',
      params: 'search_files:{"pattern":"(文件名模式，如 *.ts, test_*)"}',
      category: 'workspace',
      executor: executeSearchFiles,
    },
    {
      name: 'glob_files',
      description: '使用通配符模式匹配文件名。支持 * 和 ? 通配符。',
      params: 'glob_files:{"pattern":"(如 *.ts, src/*)","max_results":"(最大返回数，本参数可不填)"}',
      category: 'workspace',
      executor: executeGlobFiles,
    },
  ];

  for (const tool of tools) {
    toolRegistry.register(tool);
  }
}
