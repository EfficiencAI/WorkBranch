import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition, ToolResult, ToolExecutionContext } from './types';
import { toolRegistry } from './registry';
import { getWorkspaceDir } from './executors';
import { workspaceService } from '../service/workspace-service';

async function executeGetWorkspaceInfo(_args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const workspaceId = context.workspace_id;
  const info = workspaceService.getWorkspaceInfo(workspaceId);
  
  if (!info) {
    return { result: null, error: `Workspace not found: ${workspaceId}` };
  }

  const workspaceDir = getWorkspaceDir(workspaceId);
  
  let totalFiles = 0;
  let totalDirs = 0;
  let totalSize = 0;

  if (workspaceDir && fs.existsSync(workspaceDir)) {
    const countItems = (dir: string) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (item.startsWith('.')) continue;
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          totalDirs++;
          countItems(itemPath);
        } else {
          totalFiles++;
          totalSize += stat.size;
        }
      }
    };
    countItems(workspaceDir);
  }

  const result = {
    workspace_id: workspaceId,
    session_id: info.session_id,
    status: info.status,
    created_at: info.created_at,
    directory: workspaceDir,
    statistics: {
      total_files: totalFiles,
      total_directories: totalDirs,
      total_size_bytes: totalSize,
      total_size_formatted: formatBytes(totalSize),
    },
  };

  return { result, error: null };
}

async function executeGetFileTree(_args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const result = workspaceService.getFileTree(context.workspace_id);
  
  if (!result.success) {
    return { result: null, error: result.error ?? 'Unknown error' };
  }

  return { result: result.tree, error: null };
}

async function executeSearchFiles(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const pattern = (args.pattern || args.query) as string;
  if (!pattern) {
    return { result: null, error: '缺少 pattern 参数' };
  }

  const workspaceDir = getWorkspaceDir(context.workspace_id);
  if (!workspaceDir) {
    return { result: null, error: `Workspace not found: ${context.workspace_id}` };
  }

  if (!fs.existsSync(workspaceDir)) {
    return { result: [], error: null };
  }

  const maxResults = (args.max_results as number) || 50;
  const results: Array<{ path: string; line_number: number; line: string; match: string }> = [];

  const regex = new RegExp(pattern, 'gi');

  const searchInFile = (filePath: string, relativePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        const line = lines[i];
        const match = regex.exec(line);
        if (match) {
          results.push({
            path: relativePath,
            line_number: i + 1,
            line: line.trim().slice(0, 200),
            match: match[0],
          });
          regex.lastIndex = 0;
        }
      }
    } catch {
      // Skip binary or unreadable files
    }
  };

  const walk = (dir: string, baseDir: string) => {
    if (results.length >= maxResults) return;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item.startsWith('.')) continue;
      if (results.length >= maxResults) break;

      const itemPath = path.join(dir, item);
      const relativePath = path.relative(baseDir, itemPath);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        walk(itemPath, baseDir);
      } else if (stat.isFile()) {
        searchInFile(itemPath, relativePath.replace(/\\/g, '/'));
      }
    }
  };

  walk(workspaceDir, workspaceDir);

  return { result: results, error: null };
}

async function executeGlobFiles(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const pattern = (args.pattern || args.glob) as string;
  if (!pattern) {
    return { result: null, error: '缺少 pattern 参数' };
  }

  const workspaceDir = getWorkspaceDir(context.workspace_id);
  if (!workspaceDir) {
    return { result: null, error: `Workspace not found: ${context.workspace_id}` };
  }

  if (!fs.existsSync(workspaceDir)) {
    return { result: [], error: null };
  }

  const results: string[] = [];
  const maxResults = (args.max_results as number) || 100;

  const patternParts = pattern.split('*');
  const startsWith = patternParts[0];
  const endsWith = patternParts.length > 1 ? patternParts[patternParts.length - 1] : '';

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
        let matches = false;

        if (pattern === '*') {
          matches = true;
        } else if (pattern.startsWith('*') && pattern.endsWith('*')) {
          matches = item.includes(patternParts[1]);
        } else if (pattern.startsWith('*')) {
          matches = item.endsWith(endsWith);
        } else if (pattern.endsWith('*')) {
          matches = item.startsWith(startsWith);
        } else {
          matches = item === pattern;
        }

        if (matches) {
          results.push(relativePath);
        }
      }
    }
  };

  walk(workspaceDir, workspaceDir);

  return { result: results, error: null };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function registerWorkspaceTools(): void {
  const tools: ToolDefinition[] = [
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
      description: '在工作区内搜索文件内容。使用正则表达式匹配。',
      params: 'search_files:{"pattern":"(正则表达式)","max_results":"(最大返回数，本参数可不填)"}',
      category: 'workspace',
      executor: executeSearchFiles,
    },
    {
      name: 'glob_files',
      description: '使用通配符模式匹配文件名。支持 * 通配符。',
      params: 'glob_files:{"pattern":"(如 *.ts, src/*)","max_results":"(最大返回数，本参数可不填)"}',
      category: 'workspace',
      executor: executeGlobFiles,
    },
  ];

  for (const tool of tools) {
    toolRegistry.register(tool);
  }
}
