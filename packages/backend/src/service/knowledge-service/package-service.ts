import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import yauzl, { type Entry } from 'yauzl';
import { appConfig } from '../../core/config';

export type KnowledgePackageKind = 'file' | 'directory' | 'archive';

export interface KnowledgeUploadFile {
  relativePath: string;
  content: Buffer;
}

export interface KnowledgeUploadInput {
  kind: KnowledgePackageKind;
  title: string;
  files: KnowledgeUploadFile[];
}

export interface KnowledgeSourceEntry {
  path: string;
  size: number;
}

export interface PreparedKnowledgePackage {
  kind: KnowledgePackageKind;
  title: string;
  storagePath: string;
  size: number;
  entries: KnowledgeSourceEntry[];
}

interface ValidatedFile extends KnowledgeSourceEntry {
  content: Buffer;
}

interface PackageLimits {
  uploadMaxBytes: number;
  uploadMaxFiles: number;
}

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.venv',
  'venv',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
  '__pycache__',
]);

const REJECTED_EXTENSIONS = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']);

const BINARY_EXTENSIONS = new Set([
  '.a',
  '.apk',
  '.avi',
  '.bin',
  '.bmp',
  '.class',
  '.db',
  '.dll',
  '.dmg',
  '.eot',
  '.exe',
  '.flac',
  '.gif',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp3',
  '.mp4',
  '.o',
  '.otf',
  '.png',
  '.pyc',
  '.so',
  '.sqlite',
  '.sqlite3',
  '.ttf',
  '.wav',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
]);

function normalizeRelativePath(rawPath: string): string {
  const candidate = rawPath.replace(/\\/g, '/');
  if (!candidate || candidate.includes('\0') || candidate.startsWith('/') || /^[a-zA-Z]:/.test(candidate)) {
    throw new Error(`非法文件路径：${rawPath}`);
  }
  const segments = candidate.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`非法文件路径：${rawPath}`);
  }
  return segments.join('/');
}

function normalizeTitle(rawTitle: string): string {
  const title = path.posix.basename(rawTitle.replace(/\\/g, '/')).trim();
  if (!title || title === '.' || title === '..') {
    throw new Error('知识源名称不能为空');
  }
  return title;
}

function shouldIgnorePath(relativePath: string): boolean {
  const segments = relativePath.split('/');
  return segments.some((segment, index) => {
    const lower = segment.toLowerCase();
    if (segment.startsWith('.')) return true;
    return index < segments.length - 1 && IGNORED_DIRECTORIES.has(lower);
  });
}

function isRejectedExtension(relativePath: string): boolean {
  return REJECTED_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase());
}

function hasBinaryExtension(relativePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase());
}

function looksBinary(content: Buffer): boolean {
  const sampleLength = Math.min(content.length, 8192);
  if (sampleLength === 0) return false;
  let controlBytes = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = content[index];
    if (byte === 0) return true;
    if (byte < 7 || (byte > 13 && byte < 32)) controlBytes += 1;
  }
  return controlBytes / sampleLength > 0.1;
}

function assertUtf8(relativePath: string, content: Buffer): void {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    throw new Error(`文件不是有效的UTF-8文本：${relativePath}`);
  }
}

function isSymbolicLink(entry: Entry): boolean {
  const unixMode = entry.externalFileAttributes >>> 16;
  return (unixMode & 0o170000) === 0o120000;
}

export class KnowledgePackageService {
  constructor(private readonly limits: PackageLimits = appConfig.knowledge) {}

  async prepare(storageRoot: string, assistantId: number, input: KnowledgeUploadInput): Promise<PreparedKnowledgePackage> {
    const title = normalizeTitle(input.title);
    const uploadSize = input.files.reduce((sum, file) => sum + file.content.length, 0);
    this.assertWithinLimits(uploadSize, input.files.length);

    const files = input.kind === 'archive' ? await this.readArchive(input.files) : this.validateFiles(input.files);
    if (files.length === 0) {
      throw new Error('包内没有可索引的UTF-8文本或代码文件');
    }

    const parentDir = path.join(storageRoot, 'assistant-knowledge', String(assistantId));
    const packageId = randomUUID();
    const stagingPath = path.join(parentDir, `.${packageId}.staging`);
    const storagePath = path.join(parentDir, packageId);
    fs.mkdirSync(stagingPath, { recursive: true });
    try {
      for (const file of files) {
        const targetPath = path.join(stagingPath, ...file.path.split('/'));
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, file.content);
      }
      fs.renameSync(stagingPath, storagePath);
    } catch (error) {
      fs.rmSync(stagingPath, { recursive: true, force: true });
      throw error;
    }

    return {
      kind: input.kind,
      title,
      storagePath,
      size: uploadSize,
      entries: files.map(({ path: entryPath, size }) => ({
        path: entryPath,
        size,
      })),
    };
  }

  remove(storagePath: string): void {
    fs.rmSync(storagePath, { recursive: true, force: true });
  }

  private validateFiles(files: KnowledgeUploadFile[]): ValidatedFile[] {
    const seen = new Set<string>();
    let totalSize = 0;
    const validated: ValidatedFile[] = [];
    for (const file of files) {
      const relativePath = normalizeRelativePath(file.relativePath);
      if (seen.has(relativePath)) throw new Error(`包内存在重复路径：${relativePath}`);
      seen.add(relativePath);
      totalSize += file.content.length;
      this.assertWithinLimits(totalSize, seen.size);
      const accepted = this.validateFile(relativePath, file.content);
      if (accepted) validated.push(accepted);
    }
    return validated.sort((left, right) => left.path.localeCompare(right.path));
  }

  private async readArchive(files: KnowledgeUploadFile[]): Promise<ValidatedFile[]> {
    if (files.length !== 1) throw new Error('ZIP知识源必须只包含一个上传文件');
    const archive = files[0];
    if (path.extname(archive.relativePath).toLowerCase() !== '.zip') {
      throw new Error('压缩包知识源仅支持ZIP格式');
    }

    const zipFile = await yauzl.fromBufferPromise(archive.content, {
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
    const seen = new Set<string>();
    const extracted: KnowledgeUploadFile[] = [];
    let expandedSize = 0;
    let fileCount = 0;
    try {
      for await (const entry of zipFile.eachEntry()) {
        const relativePath = normalizeRelativePath(entry.fileName.replace(/\/$/, ''));
        if (isSymbolicLink(entry)) throw new Error(`ZIP包含符号链接：${relativePath}`);
        if (entry.fileName.endsWith('/')) continue;
        if (entry.isEncrypted()) throw new Error(`ZIP包含加密文件：${relativePath}`);
        if (!entry.canDecodeFileData()) throw new Error(`ZIP压缩方式不受支持：${relativePath}`);
        if (seen.has(relativePath)) throw new Error(`ZIP内存在重复路径：${relativePath}`);
        seen.add(relativePath);
        fileCount += 1;
        expandedSize += entry.uncompressedSize;
        this.assertWithinLimits(expandedSize, fileCount);

        const stream = await zipFile.openReadStreamPromise(entry);
        const chunks: Buffer[] = [];
        let actualSize = 0;
        for await (const chunk of stream) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(buffer);
          actualSize += buffer.length;
          if (actualSize > entry.uncompressedSize || actualSize > this.limits.uploadMaxBytes) {
            throw new Error(`ZIP条目大小异常：${relativePath}`);
          }
        }
        if (actualSize !== entry.uncompressedSize) {
          throw new Error(`ZIP条目大小不一致：${relativePath}`);
        }
        extracted.push({
          relativePath,
          content: Buffer.concat(chunks, actualSize),
        });
      }
    } finally {
      zipFile.close();
    }
    return this.validateFiles(extracted);
  }

  private validateFile(relativePath: string, content: Buffer): ValidatedFile | null {
    if (shouldIgnorePath(relativePath)) return null;
    if (isRejectedExtension(relativePath)) {
      throw new Error(`包内包含不支持的文件：${relativePath}`);
    }
    if (hasBinaryExtension(relativePath) || looksBinary(content)) return null;
    assertUtf8(relativePath, content);
    return { path: relativePath, size: content.length, content };
  }

  private assertWithinLimits(totalBytes: number, fileCount: number): void {
    if (!Number.isSafeInteger(totalBytes) || totalBytes > this.limits.uploadMaxBytes) {
      throw new Error(`知识源大小超过限制（${this.limits.uploadMaxBytes}字节）`);
    }
    if (fileCount > this.limits.uploadMaxFiles) {
      throw new Error(`知识源文件数超过限制（${this.limits.uploadMaxFiles}个）`);
    }
  }
}

export const knowledgePackageService = new KnowledgePackageService();
