import * as path from 'path';
import * as fs from 'fs';
import { appConfig } from '../core/config';

const BASE_DIR = path.resolve(process.cwd());
const SETTING_FILE_PATH = path.join(BASE_DIR, 'setting.json');

export class FileStorage {
  constructor() {
    if (!fs.existsSync(BASE_DIR)) {
      fs.mkdirSync(BASE_DIR, { recursive: true });
    }
  }

  getStorageRoot(): string {
    return BASE_DIR;
  }

  getSettingFilePath(): string {
    return SETTING_FILE_PATH;
  }

  ensureSettingFile(defaultContent: Record<string, unknown>): boolean {
    if (!fs.existsSync(SETTING_FILE_PATH)) {
      this.writeSettings(defaultContent);
      return true;
    }
    return false;
  }

  readSettings(): Record<string, unknown> {
    const content = fs.readFileSync(SETTING_FILE_PATH, 'utf-8');
    return JSON.parse(content);
  }

  writeSettings(data: Record<string, unknown>): void {
    fs.writeFileSync(SETTING_FILE_PATH, JSON.stringify(data, null, 4), 'utf-8');
  }

  ensureWorkspaceDir(workspaceId: string): string {
    const workspaceDir = path.join(BASE_DIR, appConfig.workspace.baseDir, workspaceId);
    if (!fs.existsSync(workspaceDir)) {
      fs.mkdirSync(workspaceDir, { recursive: true });
    }
    return workspaceDir;
  }

  readFile(filePath: string): string | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  }

  writeFile(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  deleteFile(filePath: string): boolean {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  listFiles(dirPath: string): string[] {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    return fs.readdirSync(dirPath);
  }

  fileExists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }
}

export const fileStorage = new FileStorage();
