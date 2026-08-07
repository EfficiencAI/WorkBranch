import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import yazl from 'yazl';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KnowledgePackageService, type KnowledgeUploadFile } from '../src/service/knowledge-service/package-service';

async function createZip(entries: KnowledgeUploadFile[]): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const entry of entries) zip.addBuffer(entry.content, entry.relativePath);
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('KnowledgePackageService', () => {
  let storageRoot: string;
  const service = new KnowledgePackageService({
    uploadMaxBytes: 1024 * 1024,
    uploadMaxFiles: 10,
  });

  beforeEach(() => {
    storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-knowledge-'));
  });

  afterEach(() => {
    fs.rmSync(storageRoot, { recursive: true, force: true });
  });

  it('stores a directory as one source while ignoring dependencies, hidden files, and binaries', async () => {
    const prepared = await service.prepare(storageRoot, 7, {
      kind: 'directory',
      title: 'demo-project',
      files: [
        {
          relativePath: 'src/index.ts',
          content: Buffer.from('export const answer = 42\n'),
        },
        { relativePath: 'README.md', content: Buffer.from('# Demo\n') },
        {
          relativePath: 'node_modules/pkg/index.js',
          content: Buffer.from('ignored'),
        },
        { relativePath: '.git/config', content: Buffer.from('ignored') },
        { relativePath: 'assets/logo.png', content: Buffer.from([0, 1, 2]) },
      ],
    });

    expect(prepared.kind).toBe('directory');
    expect(prepared.title).toBe('demo-project');
    expect(prepared.entries).toEqual([
      { path: 'README.md', size: 7 },
      { path: 'src/index.ts', size: 25 },
    ]);
    expect(fs.readFileSync(path.join(prepared.storagePath, 'src', 'index.ts'), 'utf8')).toContain('answer');
    expect(fs.existsSync(path.join(prepared.storagePath, 'node_modules'))).toBe(false);
  });

  it('extracts ZIP entries and preserves their relative paths', async () => {
    const archive = await createZip([
      {
        relativePath: 'project/src/main.py',
        content: Buffer.from('print(ok)\n'),
      },
      {
        relativePath: 'project/docs/guide.md',
        content: Buffer.from('# Guide\n'),
      },
    ]);
    const prepared = await service.prepare(storageRoot, 8, {
      kind: 'archive',
      title: 'project.zip',
      files: [{ relativePath: 'project.zip', content: archive }],
    });

    expect(prepared.entries.map((entry) => entry.path)).toEqual(['project/docs/guide.md', 'project/src/main.py']);
  });

  it.each([
    ['unsafe path', { relativePath: '../outside.ts', content: Buffer.from('bad') }, '非法文件路径'],
    ['non UTF-8', { relativePath: 'src/bad.txt', content: Buffer.from([0xc3, 0x28]) }, 'UTF-8'],
    ['unsupported document', { relativePath: 'docs/spec.pdf', content: Buffer.from('%PDF') }, '不支持'],
  ])('rejects the whole package for %s', async (_label, invalidFile, errorText) => {
    await expect(
      service.prepare(storageRoot, 9, {
        kind: 'directory',
        title: 'invalid',
        files: [
          {
            relativePath: 'src/good.ts',
            content: Buffer.from('export {}\n'),
          },
          invalidFile,
        ],
      }),
    ).rejects.toThrow(errorText);
  });

  it('rejects packages that exceed the configured total size', async () => {
    const limited = new KnowledgePackageService({
      uploadMaxBytes: 8,
      uploadMaxFiles: 10,
    });
    await expect(
      limited.prepare(storageRoot, 10, {
        kind: 'directory',
        title: 'large',
        files: [{ relativePath: 'large.txt', content: Buffer.from('123456789') }],
      }),
    ).rejects.toThrow('大小超过限制');
  });
});
