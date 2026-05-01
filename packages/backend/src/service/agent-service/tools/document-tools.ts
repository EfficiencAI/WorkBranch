import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition, ToolResult, ToolExecutionContext } from './types';
import { toolRegistry } from './registry';

interface DocumentMetadata {
  file_type: string;
  [key: string]: unknown;
}

interface DocumentResult {
  content: string;
  metadata: DocumentMetadata;
  total_length: number;
  read_range: string;
  truncated: boolean;
  structure?: unknown;
}

async function readPDF(
  filePath: string,
  startIdx: number = 0,
  maxLength: number = 10000,
  includeMetadata: boolean = true
): Promise<DocumentResult> {
  try {
    const pdfParse = await import('pdf-parse');
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse.default(dataBuffer);
    
    const fullText = data.text;
    const totalLength = fullText.length;
    const endIdx = Math.min(startIdx + maxLength, totalLength);
    const content = fullText.slice(startIdx, endIdx);
    
    const metadata: DocumentMetadata = {
      file_type: 'pdf',
      page_count: data.numpages,
      info: data.info,
      metadata: data.metadata,
      version: data.version,
    };
    
    return {
      content,
      metadata: includeMetadata ? metadata : { file_type: 'pdf' },
      total_length: totalLength,
      read_range: `${startIdx}-${endIdx}`,
      truncated: endIdx < totalLength,
    };
  } catch (err) {
    throw new Error(`PDF读取失败: ${String(err)}`);
  }
}

async function readDOCX(
  filePath: string,
  startIdx: number = 0,
  maxLength: number = 10000,
  includeMetadata: boolean = true
): Promise<DocumentResult> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    
    const fullText = result.value;
    const totalLength = fullText.length;
    const endIdx = Math.min(startIdx + maxLength, totalLength);
    const content = fullText.slice(startIdx, endIdx);
    
    const metadata: DocumentMetadata = {
      file_type: 'docx',
      messages: result.messages,
    };
    
    return {
      content,
      metadata: includeMetadata ? metadata : { file_type: 'docx' },
      total_length: totalLength,
      read_range: `${startIdx}-${endIdx}`,
      truncated: endIdx < totalLength,
    };
  } catch (err) {
    throw new Error(`Word文档读取失败: ${String(err)}`);
  }
}

async function readExcel(
  filePath: string,
  startIdx: number = 0,
  maxLength: number = 10000,
  includeMetadata: boolean = true
): Promise<DocumentResult> {
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.readFile(filePath);
    
    const allContent: string[] = [];
    const sheetInfo: Array<{
      name: string;
      rows: number;
      cols: number;
      content_preview: string[];
    }> = [];
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      
      const lines = csv.split('\n').filter((line: string) => line.trim());
      const preview = lines.slice(0, 5);
      
      allContent.push(`## Sheet: ${sheetName}\n${csv}`);
      
      sheetInfo.push({
        name: sheetName,
        rows: lines.length,
        cols: lines[0]?.split(',').length || 0,
        content_preview: preview,
      });
    }
    
    const fullText = allContent.join('\n\n');
    const totalLength = fullText.length;
    const endIdx = Math.min(startIdx + maxLength, totalLength);
    const content = fullText.slice(startIdx, endIdx);
    
    const metadata: DocumentMetadata = {
      file_type: path.extname(filePath).slice(1),
      sheet_count: workbook.SheetNames.length,
      sheet_names: workbook.SheetNames,
    };
    
    return {
      content,
      metadata: includeMetadata ? metadata : { file_type: path.extname(filePath).slice(1) },
      total_length: totalLength,
      read_range: `${startIdx}-${endIdx}`,
      truncated: endIdx < totalLength,
      structure: sheetInfo,
    };
  } catch (err) {
    throw new Error(`Excel文件读取失败: ${String(err)}`);
  }
}

async function executeReadDocument(args: Record<string, unknown>, _context: ToolExecutionContext): Promise<ToolResult> {
  const filePath = (args.file_path || args.path) as string;
  
  if (!filePath) {
    return { result: null, error: '缺少 file_path 参数' };
  }
  
  const startIdx = (args.start_idx as number) || 0;
  const maxLength = (args.max_length as number) || 10000;
  const includeMetadata = (args.include_metadata as boolean) ?? true;
  
  if (!fs.existsSync(filePath)) {
    return { result: null, error: `文件不存在: ${filePath}` };
  }
  
  if (!fs.statSync(filePath).isFile()) {
    return { result: null, error: `路径不是文件: ${filePath}` };
  }
  
  const ext = path.extname(filePath).toLowerCase();
  
  try {
    let result: DocumentResult;
    
    if (ext === '.pdf') {
      result = await readPDF(filePath, startIdx, maxLength, includeMetadata);
    } else if (ext === '.docx') {
      result = await readDOCX(filePath, startIdx, maxLength, includeMetadata);
    } else if (ext === '.doc') {
      return { result: null, error: '暂不支持 .doc 格式，请转换为 .docx 格式' };
    } else if (ext === '.xlsx' || ext === '.xls') {
      result = await readExcel(filePath, startIdx, maxLength, includeMetadata);
    } else {
      return { result: null, error: `不支持的文件格式: ${ext}。支持: .pdf, .docx, .xlsx, .xls` };
    }
    
    return { result, error: null };
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

const READ_DOCUMENT_TOOL: ToolDefinition = {
  name: 'read_document',
  description: '读取PDF、Word、Excel文档内容，支持分页读取和元数据提取',
  params: 'read_document:{"file_path":"(文档路径)","start_idx":"(起始索引，从第几个字符开始读，默认0)","max_length":"(最大读取字符数，默认10000)","include_metadata":"(是否包含元数据，默认true)"}',
  category: 'document',
  executor: executeReadDocument,
};

export function registerDocumentTools(): void {
  toolRegistry.register(READ_DOCUMENT_TOOL);
}

export { READ_DOCUMENT_TOOL };
