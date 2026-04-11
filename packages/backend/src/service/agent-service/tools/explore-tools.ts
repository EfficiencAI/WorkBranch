import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition, ToolResult } from './registry';
import { toolRegistry } from './registry';
import { logger } from '../../../core/logging';
import axios from 'axios';

interface SearchResult {
  file_path: string;
  line_number?: number;
  content?: string;
  snippet?: string;
}

interface InternetSearchResult {
  title: string;
  href: string;
  body: string;
}

async function executeExploreCode(args: Record<string, unknown>): Promise<ToolResult> {
  const query = args.query as string;
  if (!query) {
    return { result: null, error: '缺少 query 参数' };
  }

  const searchType = (args.search_type as string) || 'code';
  const filePattern = (args.file_pattern as string) || '*';
  const maxResults = (args.max_results as number) || 10;
  const searchPath = (args.path as string) || process.cwd();

  logger.info({
    event: 'explore.code.started',
    query,
    search_type: searchType,
    file_pattern: filePattern,
  });

  try {
    let results: SearchResult[] = [];

    switch (searchType) {
      case 'file':
        results = await searchFiles(searchPath, query, filePattern, maxResults);
        break;
      case 'structure':
        results = await searchStructure(searchPath, query, maxResults);
        break;
      case 'code':
      default:
        results = await searchCodeContent(searchPath, query, filePattern, maxResults);
        break;
    }

    if (results.length === 0) {
      return { result: '未找到相关结果', error: null };
    }

    const resultLines = [`代码库搜索结果 (查询: ${query}, 共 ${results.length} 项):\n`];

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      resultLines.push(`${i + 1}. ${item.file_path}`);
      if (item.line_number) {
        resultLines.push(`   行: ${item.line_number}`);
      }
      if (item.content || item.snippet) {
        const content = item.content || item.snippet || '';
        const truncated = content.length > 200 ? content.substring(0, 200) + '...' : content;
        resultLines.push(`   内容: ${truncated}`);
      }
      resultLines.push('');
    }

    const result = resultLines.join('\n');

    logger.info({
      event: 'explore.code.completed',
      query,
      results_count: results.length,
    });

    return { result, error: null };
  } catch (err) {
    const error = String(err);
    logger.error({
      event: 'explore.code.failed',
      query,
      error,
    });
    return { result: null, error };
  }
}

async function executeExploreInternet(args: Record<string, unknown>): Promise<ToolResult> {
  const query = args.query as string;
  if (!query) {
    return { result: null, error: '缺少 query 参数' };
  }

  const maxResults = (args.max_results as number) || 5;

  logger.info({
    event: 'explore.internet.started',
    query,
    max_results: maxResults,
  });

  try {
    const results = await searchInternet(query, maxResults);

    if (results.length === 0) {
      return { result: '未找到相关结果', error: null };
    }

    const resultLines = [`互联网搜索结果 (查询: ${query}, 共 ${results.length} 项):\n`];

    for (let i = 0; i < results.length; i++) {
      const item = results[i];
      resultLines.push(`${i + 1}. ${item.title}`);
      if (item.href) {
        resultLines.push(`   链接: ${item.href}`);
      }
      if (item.body) {
        const truncatedBody = item.body.length > 300 ? item.body.substring(0, 300) + '...' : item.body;
        resultLines.push(`   摘要: ${truncatedBody}`);
      }
      resultLines.push('');
    }

    const result = resultLines.join('\n');

    logger.info({
      event: 'explore.internet.completed',
      query,
      results_count: results.length,
    });

    return { result, error: null };
  } catch (err) {
    const error = String(err);
    logger.error({
      event: 'explore.internet.failed',
      query,
      error,
    });
    return { result: null, error: `搜索失败: ${error}` };
  }
}

async function searchFiles(
  basePath: string,
  query: string,
  pattern: string,
  maxResults: number
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxResults) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          const matchesPattern = pattern === '*' || entry.name.includes(pattern.replace('*', ''));
          const matchesQuery = entry.name.toLowerCase().includes(lowerQuery);

          if (matchesPattern && matchesQuery) {
            results.push({ file_path: fullPath });
          }
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  await walk(basePath);
  return results;
}

async function searchCodeContent(
  basePath: string,
  query: string,
  pattern: string,
  maxResults: number
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  const textFileExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.c', '.cpp', '.h',
    '.json', '.yaml', '.yml', '.md', '.txt', '.xml', '.html', '.css',
  ];

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxResults) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          const matchesPattern = pattern === '*' || entry.name.includes(pattern.replace('*', ''));

          if (matchesPattern && textFileExtensions.includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');

              for (let i = 0; i < lines.length; i++) {
                if (results.length >= maxResults) break;

                if (lines[i].toLowerCase().includes(lowerQuery)) {
                  results.push({
                    file_path: fullPath,
                    line_number: i + 1,
                    content: lines[i].trim(),
                  });
                }
              }
            } catch {
              // 忽略无法读取的文件
            }
          }
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  await walk(basePath);
  return results;
}

async function searchStructure(
  basePath: string,
  query: string,
  maxResults: number
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  async function walk(dir: string, depth: number = 0): Promise<void> {
    if (results.length >= maxResults || depth > 5) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(dir, entry.name);

        if (entry.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            file_path: fullPath,
            snippet: entry.isDirectory() ? '[目录]' : '[文件]',
          });
        }

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath, depth + 1);
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  await walk(basePath);
  return results;
}

async function searchInternet(query: string, maxResults: number): Promise<InternetSearchResult[]> {
  const results: InternetSearchResult[] = [];

  try {
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 1,
      },
      timeout: 10000,
    });

    const data = response.data;

    if (data.AbstractText) {
      results.push({
        title: data.Heading || '摘要',
        href: data.AbstractURL || '',
        body: data.AbstractText,
      });
    }

    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= maxResults) break;

        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || '相关主题',
            href: topic.FirstURL,
            body: topic.Text,
          });
        }
      }
    }

    return results.slice(0, maxResults);
  } catch (err) {
    logger.error({
      event: 'explore.internet.api_error',
      error: String(err),
    });

    return [
      {
        title: '搜索服务暂时不可用',
        href: '',
        body: '无法连接到搜索服务，请稍后重试。您也可以直接访问 https://duckduckgo.com 搜索。',
      },
    ];
  }
}

export function registerExploreTools(): void {
  const tools: ToolDefinition[] = [
    {
      name: 'explore_code',
      description: '探索代码库，搜索文件、代码内容或目录结构',
      params: 'query, search_type(file/code/structure), file_pattern, max_results, path',
      category: 'explore',
      executor: executeExploreCode,
    },
    {
      name: 'explore_internet',
      description: '搜索互联网获取信息，使用 DuckDuckGo 搜索引擎',
      params: 'query, max_results',
      category: 'explore',
      executor: executeExploreInternet,
    },
  ];

  for (const tool of tools) {
    toolRegistry.register(tool);
  }

  logger.info({
    event: 'tools.registered',
    category: 'explore',
    count: tools.length,
  });
}
