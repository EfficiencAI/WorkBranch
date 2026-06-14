import { conversationDAO } from '../../data';
import { db } from '../../core/database';
import { SegmentType } from './canonical';

interface DraftMessage {
  id: string;
  conversation_id: string;
  session_id: number;
  user_content: string;
  assistant_content: string | null;
  thinking_content: string | null;
  status: string;
  created_at: string;
}

class ConversationBuffer {
  private drafts: Map<string, DraftMessage> = new Map();

  async createMessage(
    messageId: string,
    conversationId: string,
    sessionId: number,
    userContent: string
  ): Promise<void> {
    const draft: DraftMessage = {
      id: messageId,
      conversation_id: conversationId,
      session_id: sessionId,
      user_content: userContent,
      assistant_content: null,
      thinking_content: null,
      status: 'streaming',
      created_at: new Date().toISOString(),
    };

    this.drafts.set(messageId, draft);
    conversationDAO.createMessage(messageId, conversationId, sessionId, userContent, 'streaming');
  }

  hasDraft(messageId: string): boolean {
    return this.drafts.has(messageId);
  }

  getDraft(messageId: string): DraftMessage | undefined {
    return this.drafts.get(messageId);
  }

  async appendContent(messageId: string, content: string, isThinking: boolean = false): Promise<void> {
    const draft = this.drafts.get(messageId);
    if (!draft) return;

    if (isThinking) {
      draft.thinking_content = (draft.thinking_content || '') + content;
    } else {
      draft.assistant_content = (draft.assistant_content || '') + content;
    }
  }

  async completeMessage(messageId: string): Promise<void> {
    const fs = require('fs');
    const draft = this.drafts.get(messageId);
    fs.appendFileSync('e:\\\\PythonProject\\\\WorkBranch\\.tmp-debug\\mq-trace.log',
      `[${new Date().toISOString()}] [buffer] completeMessage mid=${messageId} hasDraft=${!!draft} contentLen=${draft?.assistant_content?.length || 0}\n`);
    // FORCE output to verify code path - use same method as MQ trace
    require('fs').appendFileSync('e:\\\\PythonProject\\\\WorkBranch\\.tmp-debug\\step-trace.log',
      `[${new Date().toISOString()}] [STEP-TRACE] completeMessage ENTER mid=${messageId} draft=${!!draft}\n`);

    const _stepLog = (msg) => require('fs').appendFileSync('e:\\\\PythonProject\\\\WorkBranch\\.tmp-debug\\step-trace.log',
      `[${new Date().toISOString()}] [STEP-TRACE] ${msg}\n`);

    if (!draft) {
      console.warn('[buffer] completeMessage: no draft for', messageId,
        'available drafts:', Array.from(this.drafts.keys()));
      return;
    }

    _stepLog(`STEP1: calling updateMessageAssistant for ${messageId}`);
    try {
      await conversationDAO.updateMessageAssistant(
        messageId,
        draft.assistant_content || '',
        'completed',
        draft.thinking_content ?? null
      );
      _stepLog('STEP2: updateMessageAssistant DONE');
    } catch(daoErr) {
      _stepLog(`STEP2-ERR: ${daoErr.message}`);
      throw daoErr;
    }

    // CRITICAL: Flush sql.js in-memory DB to disk
    _stepLog('STEP3: calling db.save()');
    try {
      // VERIFY: Check what's actually in sql.js memory BEFORE save
      const _verifyDb = require('../../core/database').db;
      _stepLog(`VERIFY: same db instance? ${_verifyDb === require('../../core/database').db}`);
      try {
        // Try to count conversations in sql.js memory
        const verifyStmt = _verifyDb.prepare('SELECT COUNT(*) as cnt FROM conversations');
        const verifyRow = verifyStmt.get();
        _stepLog(`VERIFY sql.js mem: conversations=${(verifyRow as any)?.cnt}`);
        verifyStmt.free();

        const msgStmt = _verifyDb.prepare('SELECT COUNT(*) as cnt FROM messages');
        const msgRow = msgStmt.get();
        _stepLog(`VERIFY sql.js mem: messages=${(msgRow as any)?.cnt}`);
        msgStmt.free();

        // Find our specific message
        const findMsg = _verifyDb.prepare('SELECT id, status, length(assistant_content) as alen FROM messages WHERE id = ?').get(messageId);
        _stepLog(`VERIFY our msg in sql.js mem: ${!!findMsg} | ${JSON.stringify(findMsg)}`);

        // Find our conversation
        const findConv = _verifyDb.prepare('SELECT id FROM conversations WHERE id = ?').get(
          (draft as any).conversation_id || ''
        );
        _stepLog(`VERIFY our conv in sql.js mem: ${!!findConv}`);
      } catch(vErr) {
        _stepLog(`VERIFY error: ${vErr.message}`);
      }

      const fs_mod = require('fs');
      const beforeSize = fs_mod.existsSync('data/workbranch.db') ? fs_mod.statSync('data/workbranch.db').size : 0;
      db.save();
      const afterSize = fs_mod.existsSync('data/workbranch.db') ? fs_mod.statSync('data/workbranch.db').size : 0;
      _stepLog(`db.save() DONE size: ${beforeSize} -> ${afterSize}`);
    } catch(saveErr) {
      _stepLog(`db.save() ERROR: ${saveErr.message}`);
    }

    this.drafts.delete(messageId);
    _stepLog(`SUCCESS for mid=${messageId}`);
  }

  async failMessage(messageId: string): Promise<void> {
    const draft = this.drafts.get(messageId);
    if (!draft) return;

    conversationDAO.updateMessageStatus(messageId, 'failed');
    this.drafts.delete(messageId);
  }

  async consumeMessage(message: import('./canonical').Message): Promise<void> {
    const draft = this.drafts.get(message.message_id);
    if (!draft) {
      console.warn('[buffer] consumeMessage: no draft for mid=', message.message_id,
        'available:', Array.from(this.drafts.keys()));
      return;
    }

    for (const block of message.content_blocks) {
      const t = block.type as SegmentType;
      // Agent uses CHAT_DELTA for streaming text; also handle TEXT_DELTA/THINKING_DELTA
      if (t === SegmentType.TEXT_DELTA || t === SegmentType.CHAT_DELTA) {
        draft.assistant_content = (draft.assistant_content || '') + block.content;
      } else if (t === SegmentType.THINKING_DELTA) {
        draft.thinking_content = (draft.thinking_content || '') + block.content;
      }
    }
  }

  clear(conversationId: string): void {
    for (const [id, draft] of this.drafts) {
      if (draft.conversation_id === conversationId) {
        this.drafts.delete(id);
      }
    }
  }
}

export const conversationBuffer = new ConversationBuffer();
