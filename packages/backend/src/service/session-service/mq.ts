import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as path from 'path';
import * as fs from 'fs';
import { Message, SegmentType } from './canonical';
import { conversationBuffer } from './conversation-buffer';
import { logger } from '../../core/logging';

interface StreamState {
  conversation_id: string;
  last_seq: number;
  is_completed: boolean;
  session_id: string;
  workspace_id: string;
}

interface MessageRecord {
  id: number;
  conversation_id: string;
  seq: number;
  message_id: string;
  session_id: string;
  workspace_id: string;
  message_type: string;
  content: string;
  metadata: string;
  created_at: string;
}

interface SubscriberQueue {
  queue: Array<{ message: Message; seq: number }>;
  callback: MessageCallback;
}

type MessageCallback = (message: Message, seq: number) => void;

interface SubscribeOptions {
  lastSeq?: number;
}

/**
 * 写透代理：sql.js + 自动持久化（与 sqlite.ts 同构）
 */
class MqPersistentDatabase {
  private _db: SqlJsDatabase;
  private dbPath: string;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;
  private fd: number | null = null;
  private closed = false;

  constructor(db: SqlJsDatabase, dbPath: string) {
    this._db = db; this.dbPath = dbPath;
    try { this.fd = fs.openSync(fs.existsSync(dbPath) ? dbPath : (fs.writeFileSync(dbPath, ''), dbPath), 'r+'); } catch { /* ignore */ }
  }

  exec(sql: string): void {
    if (this.closed) throw new Error('Database is closed');
    this._db.exec(sql);
    if (/^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE|TRUNCATE)\b/i.test(sql.trim())) this.scheduleSave();
  }

  prepare(sql: string): MqStatementProxy { if (this.closed) throw new Error('closed'); return new MqStatementProxy(this, sql); }
  pragma(cmd: string): unknown[] { if (this.closed) throw new Error('closed'); const r = this._db.exec(`PRAGMA ${cmd}`); return r.length > 0 ? r[0].values : []; }
  close(): void { if (this.closed) return; this.closed = true; this.forceSave(); if (this.fd !== null) { try { fs.closeSync(this.fd); } catch {} this.fd = null; } this._db.close(); }

  /** @internal 供 MqStatementProxy 使用 */
  get rawDb(): SqlJsDatabase { return this._db; }
  scheduleSave(): void { this.dirty = true; if (!this.saveTimer) this.saveTimer = setTimeout(() => this.forceSave(), 50); }
  forceSave(): void { if (!this.dirty || this.closed) return; try { fs.writeFileSync(this.dbPath, Buffer.from(this._db.export())); if (this.fd !== null) fs.fsyncSync(this.fd); } catch {} this.dirty = false; if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; } }
}

class MqStatementProxy {
  private owner: MqPersistentDatabase; private sql: string;
  constructor(o: MqPersistentDatabase, s: string) { this.owner = o; this.sql = s; }
  run(...params: unknown[]): { changes: number; lastInsertRowid: number } { const r = this.owner.rawDb.run(this.sql, params); this.owner.scheduleSave(); return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) }; }
  get<T = unknown>(...params: unknown[]): T | undefined { const stmt = this.owner.rawDb.prepare(this.sql); if (params?.length) stmt.bind(params); if (stmt.step()) { const r = stmt.getAsObject() as T; stmt.free(); return r; } stmt.free(); return undefined; }
  all<T = unknown>(...params: unknown[]): T[] { const results: T[] = []; const stmt = this.owner.rawDb.prepare(this.sql); if (params?.length) stmt.bind(params); while (stmt.step()) results.push(stmt.getAsObject() as T); stmt.free(); return results; }
}

class HybridMessageQueue {
  private dbPath: string;
  private db: MqPersistentDatabase | null = null;
  private initPromise: Promise<void>;

  private subscribers: Map<string, Set<MessageCallback>> = new Map();
  private subscriberQueues: Map<string, SubscriberQueue[]> = new Map();

  private streamStates: Map<string, StreamState> = new Map();

  constructor(dbPath?: string, _maxSize: number = 1000) {
    const dataDir = process.env.FILES_DIR || process.cwd();
    this.dbPath = dbPath || path.join(dataDir, 'data', 'mq.db');
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    const dbDir = path.dirname(this.dbPath);
    if (dbDir && !fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const SQL = await initSqlJs();
    let db: SqlJsDatabase;
    if (fs.existsSync(this.dbPath)) {
      db = new SQL.Database(fs.readFileSync(this.dbPath));
    } else {
      db = new SQL.Database();
    }

    this.db = new MqPersistentDatabase(db, this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');

    this.initDb();
  }

  private initDb(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS message_stream (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        message_id TEXT NOT NULL,
        session_id TEXT,
        workspace_id TEXT,
        message_type TEXT NOT NULL,
        content TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(conversation_id, seq)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conv_seq 
      ON message_stream(conversation_id, seq)
    `);
  }

  private logEvent(
    level: 'INFO' | 'ERROR',
    event: string,
    msg: string,
    conversationId?: string,
    extra?: Record<string, unknown>
  ): void {
    const logData: Record<string, unknown> = {
      event,
      message: msg,
      ...extra
    };
    if (conversationId) {
      logData.conversation_id = conversationId;
    }
    if (level === 'ERROR') {
      logger.error(logData);
    } else {
      logger.info(logData);
    }
  }

  private async ensureInit(): Promise<void> {
    await this.initPromise;
  }

  private getNextSeq(conversationId: string): number {
    const state = this.streamStates.get(conversationId);
    if (state) {
      state.last_seq += 1;
      return state.last_seq;
    }

    let maxSeq = 0;
    if (this.db) {
      const row = this.db.prepare(
        'SELECT MAX(seq) as max_seq FROM message_stream WHERE conversation_id = ?'
      ).get(conversationId ?? '') as any;
      maxSeq = (row?.max_seq as number) || 0;
    }

    const nextSeq = maxSeq + 1;
    this.streamStates.set(conversationId, {
      conversation_id: conversationId,
      last_seq: nextSeq,
      is_completed: false,
      session_id: '',
      workspace_id: ''
    });
    return nextSeq;
  }

  private saveToSqlite(message: Message, seq: number): void {
    if (!this.db) return;

    try {
      const contentBlocks = JSON.stringify(message.content_blocks);
      const metadata = JSON.stringify(message.metadata || {});

      this.db.prepare(
        `INSERT INTO message_stream
         (conversation_id, seq, message_id, session_id, workspace_id, message_type, content, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        message.conversation_id,
        seq,
        message.message_id,
        message.session_id ?? '',
        message.workspace_id ?? '',
        this.getPrimaryMessageType(message),
        contentBlocks,
        metadata
      );

      this.logEvent('INFO', 'mq.message.saved', 'Message saved to SQLite', message.conversation_id, {
        seq,
        message_id: message.message_id
      });
    } catch (e) {
      this.logEvent('ERROR', 'mq.sqlite.save_failed', `SQLite save error: ${e}`, message.conversation_id);
      const state = this.streamStates.get(message.conversation_id);
      if (state) {
        state.last_seq -= 1;
      }
    }
  }

  private getPrimaryMessageType(message: Message): string {
    if (message.content_blocks.length > 0) {
      return message.content_blocks[0].type;
    }
    return 'unknown';
  }

  private cleanupConversation(conversationId: string): void {
    if (!this.db) return;

    try {
      this.db.prepare(
        'DELETE FROM message_stream WHERE conversation_id = ?'
      ).run(conversationId ?? '');

      const state = this.streamStates.get(conversationId);
      if (state) {
        state.is_completed = true;
        state.last_seq = 0;
      }

      this.logEvent('INFO', 'mq.conversation.cleaned', 'Conversation messages cleaned', conversationId);
    } catch (e) {
      this.logEvent('ERROR', 'mq.cleanup.failed', `Cleanup error: ${e}`, conversationId);
    }
  }

  private isDoneMessage(message: Message): boolean {
    return message.content_blocks.some(block => block.type === SegmentType.DONE);
  }

  private isErrorMessage(message: Message): boolean {
    return message.content_blocks.some(block => block.type === SegmentType.ERROR);
  }

  /** 将消息路由到 conversationBuffer，确保内容最终持久化到 DB */
  private routeToBuffer(message: Message): void {
    const mid = message.message_id;
    const blockType = this.getPrimaryMessageType(message);

    if (!mid) {
      this.logEvent('ERROR', 'mq.buffer.no_mid', `Message has no message_id, type=${blockType}`, message.conversation_id);
      return;
    }

    if (this.isDoneMessage(message)) {
      this.logEvent('INFO', 'mq.buffer.route_done', `Routing DONE for mid=${mid}`, message.conversation_id);
      conversationBuffer.completeMessage(mid).catch(err =>
        this.logEvent('ERROR', 'mq.buffer.complete_failed', `completeMessage error: ${err}`, message.conversation_id)
      );
      return;
    }

    if (this.isErrorMessage(message)) {
      this.logEvent('INFO', 'mq.buffer.route_error', `Routing ERROR for mid=${mid}`, message.conversation_id);
      conversationBuffer.failMessage(mid).catch(err =>
        this.logEvent('ERROR', 'mq.buffer.fail_failed', `failMessage error: ${err}`, message.conversation_id)
      );
      return;
    }

    // text_delta / thinking_delta 等内容块 → 累积到 buffer draft
    this.logEvent('INFO', 'mq.buffer.route_consume', `Routing consume for mid=${mid} type=${blockType}`, message.conversation_id);
    conversationBuffer.consumeMessage(message).catch(err =>
      this.logEvent('ERROR', 'mq.buffer.consume_failed', `consumeMessage error: ${err}`, message.conversation_id)
    );
  }

  async publish(message: Message): Promise<boolean> {
    await this.ensureInit();

    try {
      const seq = this.getNextSeq(message.conversation_id);
      this.saveToSqlite(message, seq);

      // 单路径：MQ 统一将消息路由到 buffer，确保内容持久化到 DB
      this.routeToBuffer(message);

      if (this.isDoneMessage(message)) {
        const state = this.streamStates.get(message.conversation_id);
        if (state) {
          state.is_completed = true;
        }
        this.cleanupConversation(message.conversation_id);
      }

      this.publishToSubscribers(message, seq);

      this.logEvent('INFO', 'mq.message.published', 'Message published', message.conversation_id, {
        seq,
        type: this.getPrimaryMessageType(message)
      });
      return true;
    } catch (e) {
      this.logEvent('ERROR', 'mq.publish.failed', `Publish error: ${e}`, message.conversation_id);
      return false;
    }
  }

  publishSync(message: Message): boolean {
    this.ensureInit().then(() => {
      this.publish(message);
    }).catch(e => {
      this.logEvent('ERROR', 'mq.publish_sync.failed', `Publish sync error: ${e}`, message.conversation_id);
    });
    return true;
  }

  private publishToSubscribers(message: Message, seq: number): void {
    const callbacks = this.subscribers.get(message.conversation_id);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(message, seq);
        } catch (err) {
          this.logEvent('ERROR', 'mq.callback.error', `Subscriber callback error: ${err}`, message.conversation_id);
        }
      });
    }

    const queues = this.subscriberQueues.get(message.conversation_id);
    if (queues) {
      queues.forEach(sq => {
        sq.queue.push({ message, seq });
        try {
          sq.callback(message, seq);
        } catch (err) {
          this.logEvent('ERROR', 'mq.queue.callback.error', `Queue callback error: ${err}`, message.conversation_id);
        }
      });
    }
  }

  getMessagesAfter(conversationId: string, lastSeq: number): Array<{ message: Message; seq: number }> {
    if (!this.db) return [];

    const rows = this.db.prepare(
      `SELECT seq, message_id, session_id, workspace_id, message_type, content, metadata
       FROM message_stream
       WHERE conversation_id = ? AND seq > ?
       ORDER BY seq ASC`
    ).all(conversationId, lastSeq) as unknown as MessageRecord[];

    return rows.map(row => {
      try {
        const contentBlocks = JSON.parse(row.content || '[]');
        const metadata = JSON.parse(row.metadata || '{}');
        const message: Message = {
          role: 'assistant',
          message_id: row.message_id,
          conversation_id: row.conversation_id,
          session_id: row.session_id || '',
          workspace_id: row.workspace_id || '',
          content_blocks: contentBlocks,
          content: '',
          timestamp: row.created_at,
          metadata
        };
        return { message, seq: row.seq };
      } catch (e) {
        this.logEvent('ERROR', 'mq.parse.failed', `Failed to parse message: ${e}`, conversationId);
        return null as any;
      }
    }).filter(Boolean);
  }

  getStreamState(conversationId: string): StreamState {
    const state = this.streamStates.get(conversationId);
    if (state) {
      return { ...state };
    }

    if (this.db) {
      const row = this.db.prepare(
        `SELECT MAX(seq) as max_seq, message_type, session_id, workspace_id
         FROM message_stream
         WHERE conversation_id = ?
         ORDER BY seq DESC LIMIT 1`
      ).get(conversationId) as any;

      if (row) {
        return {
          conversation_id: conversationId,
          last_seq: (row.max_seq as number) || 0,
          is_completed: row.message_type === SegmentType.DONE,
          session_id: (row.session_id as string) || '',
          workspace_id: (row.workspace_id as string) || ''
        };
      }
    }

    return {
      conversation_id: conversationId,
      last_seq: 0,
      is_completed: true,
      session_id: '',
      workspace_id: ''
    };
  }

  registerStream(conversationId: string, sessionId: string, workspaceId: string): void {
    const state = this.streamStates.get(conversationId);
    if (state) {
      state.session_id = sessionId;
      state.workspace_id = workspaceId;
    } else {
      this.streamStates.set(conversationId, {
        conversation_id: conversationId,
        last_seq: 0,
        is_completed: false,
        session_id: sessionId,
        workspace_id: workspaceId
      });
    }
  }

  subscribe(
    conversationId: string,
    callback: MessageCallback,
    options?: SubscribeOptions
  ): () => void {
    const lastSeq = options?.lastSeq || 0;

    if (!this.subscribers.has(conversationId)) {
      this.subscribers.set(conversationId, new Set());
    }
    this.subscribers.get(conversationId)!.add(callback);

    if (lastSeq > 0) {
      this.ensureInit().then(() => {
        const missedMessages = this.getMessagesAfter(conversationId, lastSeq);
        missedMessages.forEach(({ message, seq }) => {
          try {
            callback(message, seq);
          } catch (err) {
            this.logEvent('ERROR', 'mq.replay.callback.error', `Replay callback error: ${err}`, conversationId);
          }
        });
      }).catch(e => {
        this.logEvent('ERROR', 'mq.replay.failed', `Replay failed: ${e}`, conversationId);
      });
    }

    return () => {
      const callbacks = this.subscribers.get(conversationId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(conversationId);
        }
      }
    };
  }

  subscribeWithQueue(
    conversationId: string,
    callback: MessageCallback,
    options?: SubscribeOptions
  ): { unsubscribe: () => void; queue: Array<{ message: Message; seq: number }> } {
    const lastSeq = options?.lastSeq || 0;
    const queue: Array<{ message: Message; seq: number }> = [];

    const sq: SubscriberQueue = { queue, callback };

    if (!this.subscriberQueues.has(conversationId)) {
      this.subscriberQueues.set(conversationId, []);
    }
    this.subscriberQueues.get(conversationId)!.push(sq);

    if (lastSeq > 0) {
      this.ensureInit().then(() => {
        const missedMessages = this.getMessagesAfter(conversationId, lastSeq);
        missedMessages.forEach(({ message, seq }) => {
          queue.push({ message, seq });
          try {
            callback(message, seq);
          } catch (err) {
            this.logEvent('ERROR', 'mq.replay.callback.error', `Replay callback error: ${err}`, conversationId);
          }
        });
      }).catch(e => {
        this.logEvent('ERROR', 'mq.replay.failed', `Replay failed: ${e}`, conversationId);
      });
    }

    return {
      unsubscribe: () => {
        const queues = this.subscriberQueues.get(conversationId);
        if (queues) {
          const idx = queues.indexOf(sq);
          if (idx >= 0) {
            queues.splice(idx, 1);
          }
          if (queues.length === 0) {
            this.subscriberQueues.delete(conversationId);
          }
        }
      },
      queue
    };
  }

  unsubscribe(conversationId: string, callback?: MessageCallback): void {
    if (callback) {
      const callbacks = this.subscribers.get(conversationId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(conversationId);
        }
      }
    } else {
      this.subscribers.delete(conversationId);
      this.subscriberQueues.delete(conversationId);
    }
  }

  getHistory(conversationId: string): Message[] {
    const messages = this.getMessagesAfter(conversationId, 0);
    return messages.map(m => m.message);
  }

  clearHistory(conversationId: string): void {
    this.cleanupConversation(conversationId);
  }

  clear(conversationId: string): void {
    this.subscribers.delete(conversationId);
    this.subscriberQueues.delete(conversationId);
    this.streamStates.delete(conversationId);
    this.cleanupConversation(conversationId);
  }

  async close(): Promise<void> {
    await this.ensureInit();
    this.subscribers.clear();
    this.subscriberQueues.clear();
    this.streamStates.clear();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  get size(): number {
    return 0;
  }

  get isRunning(): boolean {
    return true;
  }
}

export const messageQueue = new HybridMessageQueue();
export { HybridMessageQueue };
