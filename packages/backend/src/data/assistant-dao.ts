import { db } from '../core/database';

export interface Assistant {
  id: number;
  owner_id: number;
  name: string;
  avatar: string | null;
  description: string | null;
  welcome_message: string | null;
  system_rules: string | null;
  model: string | null;
  base_url: string | null;
  temperature: number | null;
  max_tokens: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSource {
  id: number;
  assistant_id: number;
  type: string;
  title: string;
  file_path: string | null;
  size: number | null;
  status: string;
  error: string | null;
  version: number;
  chunk_count: number;
  created_at: string;
}

export interface ShareInfo {
  id: number;
  assistant_id: number;
  token: string;
  mode: string;
  password_hash: string | null;
  expires_at: string | null;
  enabled: number;
  created_at: string;
}

export interface KnowledgeChunkRow {
  id: number;
  source_id: number;
  assistant_id: number;
  seq: number;
  content: string;
  token_count: number | null;
  embedding: string | null;
}

export type AssistantCreateInput = Pick<Assistant, 'name'> &
  Partial<Pick<Assistant, 'avatar' | 'description' | 'welcome_message' | 'system_rules' | 'model' | 'base_url' | 'temperature' | 'max_tokens' | 'status'>>;

export class AssistantDAO {
  create(ownerId: number, input: AssistantCreateInput): number {
    const stmt = db.prepare(`
      INSERT INTO assistants (owner_id, name, avatar, description, welcome_message, system_rules, model, base_url, temperature, max_tokens, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      ownerId,
      input.name,
      input.avatar ?? null,
      input.description ?? null,
      input.welcome_message ?? null,
      input.system_rules ?? null,
      input.model ?? null,
      input.base_url ?? null,
      input.temperature ?? null,
      input.max_tokens ?? null,
      input.status ?? 'draft',
    );
    return result.lastInsertRowid as number;
  }

  listByOwner(ownerId: number): Assistant[] {
    return db.prepare('SELECT * FROM assistants WHERE owner_id = ? ORDER BY updated_at DESC').all<Assistant>(ownerId);
  }

  getById(id: number): Assistant | null {
    return db.prepare('SELECT * FROM assistants WHERE id = ?').get<Assistant>(id) ?? null;
  }

  update(id: number, input: Partial<AssistantCreateInput>): void {
    const current = this.getById(id);
    if (!current) return;
    const next: Assistant = { ...current, ...input };
    db.prepare(`
      UPDATE assistants SET
        name = ?, avatar = ?, description = ?, welcome_message = ?, system_rules = ?,
        model = ?, base_url = ?, temperature = ?, max_tokens = ?, status = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      next.name, next.avatar, next.description, next.welcome_message, next.system_rules,
      next.model, next.base_url, next.temperature, next.max_tokens, next.status, id,
    );
  }

  delete(id: number): void {
    db.prepare('DELETE FROM assistants WHERE id = ?').run(id);
  }

  listSources(assistantId: number): KnowledgeSource[] {
    return db.prepare('SELECT * FROM knowledge_sources WHERE assistant_id = ? ORDER BY created_at DESC').all<KnowledgeSource>(assistantId);
  }

  addSource(assistantId: number, input: Pick<KnowledgeSource, 'type' | 'title'> & Partial<Pick<KnowledgeSource, 'file_path' | 'size' | 'status'>>): number {
    const stmt = db.prepare(`
      INSERT INTO knowledge_sources (assistant_id, type, title, file_path, size, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(assistantId, input.type, input.title, input.file_path ?? null, input.size ?? null, input.status ?? 'pending');
    return result.lastInsertRowid as number;
  }

  deleteSource(id: number): void {
    db.prepare('DELETE FROM knowledge_sources WHERE id = ?').run(id);
  }

  getSourceById(assistantId: number, sourceId: number): KnowledgeSource | null {
    return db.prepare('SELECT * FROM knowledge_sources WHERE id = ? AND assistant_id = ?')
      .get<KnowledgeSource>(sourceId, assistantId) ?? null;
  }

  setSourceStatus(sourceId: number, status: string, error: string | null = null, chunkCount?: number): void {
    if (chunkCount !== undefined) {
      db.prepare('UPDATE knowledge_sources SET status = ?, error = ?, chunk_count = ? WHERE id = ?')
        .run(status, error, chunkCount, sourceId);
    } else {
      db.prepare('UPDATE knowledge_sources SET status = ?, error = ? WHERE id = ?')
        .run(status, error, sourceId);
    }
  }

  bumpSourceVersion(sourceId: number): void {
    db.prepare('UPDATE knowledge_sources SET version = version + 1 WHERE id = ?').run(sourceId);
  }

  deleteChunks(sourceId: number): void {
    db.prepare('DELETE FROM knowledge_chunks WHERE source_id = ?').run(sourceId);
  }

  insertChunk(sourceId: number, assistantId: number, seq: number, content: string, tokenCount: number, embedding: number[] | null): number {
    const stmt = db.prepare(`
      INSERT INTO knowledge_chunks (source_id, assistant_id, seq, content, token_count, embedding)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(sourceId, assistantId, seq, content, tokenCount, embedding ? JSON.stringify(embedding) : null);
    return result.lastInsertRowid as number;
  }

  getChunksBySource(sourceId: number): KnowledgeChunkRow[] {
    return db.prepare('SELECT * FROM knowledge_chunks WHERE source_id = ? ORDER BY seq').all<KnowledgeChunkRow>(sourceId);
  }

  getChunksByAssistant(assistantId: number): KnowledgeChunkRow[] {
    return db.prepare('SELECT * FROM knowledge_chunks WHERE assistant_id = ?').all<KnowledgeChunkRow>(assistantId);
  }

  createShare(assistantId: number, token: string, mode: string, passwordHash: string | null, expiresAt: string | null): number {
    const stmt = db.prepare(`
      INSERT INTO shares (assistant_id, token, mode, password_hash, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(assistantId, token, mode, passwordHash, expiresAt);
    return result.lastInsertRowid as number;
  }

  listShares(assistantId: number): ShareInfo[] {
    return db.prepare('SELECT * FROM shares WHERE assistant_id = ? ORDER BY created_at DESC').all<ShareInfo>(assistantId);
  }

  getShareByToken(token: string): ShareInfo | null {
    return db.prepare('SELECT * FROM shares WHERE token = ?').get<ShareInfo>(token) ?? null;
  }

  setShareEnabled(id: number, enabled: number): void {
    db.prepare('UPDATE shares SET enabled = ? WHERE id = ?').run(enabled, id);
  }

  deleteShare(id: number): void {
    db.prepare('DELETE FROM shares WHERE id = ?').run(id);
  }
}

export const assistantDAO = new AssistantDAO();
