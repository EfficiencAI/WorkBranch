import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';

const dao = vi.hoisted(() => ({
  createSession: vi.fn((_userId: number, _title: string, _workspaceId: string) => 1),
  getSessionById: vi.fn(),
  listSessionsByUserId: vi.fn(),
  deleteSession: vi.fn(),
  listConversationsBySession: vi.fn(() => []),
  getConversationById: vi.fn(),
  createConversation: vi.fn(),
  listConversationSummariesBySession: vi.fn(() => []),
  updateConversationPositions: vi.fn(),
  deleteConversation: vi.fn(),
  clearChildConversationParents: vi.fn(),
  deleteMessagesByConversation: vi.fn(),
}));

vi.mock('../src/data', () => ({
  conversationDAO: dao,
  fileStorage: {
    ensureSettingFile: vi.fn(),
    readSettings: vi.fn(() => ({})),
    writeSettings: vi.fn(),
    getStorageRoot: vi.fn(() => path.join(os.tmpdir(), 'wb-session-isolation-test')),
  },
  userDAO: {},
}));

import { sessionService } from '../src/service/session-service/session';

describe('session user isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createSession stores the requesting userId', () => {
    sessionService.createSession(7, 'title');
    expect(dao.createSession).toHaveBeenCalledWith(7, 'title', expect.any(String));
  });

  it('getSession returns null when session belongs to another user', () => {
    dao.getSessionById.mockReturnValue({
      id: 3,
      user_id: 9,
      title: 't',
      workspace_id: null,
      created_at: '',
      updated_at: '',
    });
    expect(sessionService.getSession(1, 3)).toBeNull();
    expect(sessionService.getSession(9, 3)).not.toBeNull();
  });

  it('listSessions filters by the requesting userId', () => {
    dao.listSessionsByUserId.mockReturnValue([{ id: 1 }]);
    sessionService.listSessions(5);
    expect(dao.listSessionsByUserId).toHaveBeenCalledWith(5);
  });

  it('getOwnedConversation rejects conversations in another user session', () => {
    dao.getConversationById.mockReturnValue({ id: 'c1', session_id: 3 });
    dao.getSessionById.mockReturnValue({
      id: 3,
      user_id: 9,
      title: 't',
      workspace_id: null,
      created_at: '',
      updated_at: '',
    });
    expect(sessionService.getOwnedConversation(1, 'c1')).toBeNull();
    expect(sessionService.getOwnedConversation(9, 'c1')).not.toBeNull();
  });
});
