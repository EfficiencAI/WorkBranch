import { describe, expect, it, vi } from "vitest";

vi.mock("../src/core/database", () => ({ db: {} }));

import {
  ConversationDAO,
  type Conversation,
  type Message,
} from "../src/data/conversation-dao";
import {
  assertContextMessagesDisjoint,
  toAgentContextMessages,
} from "../src/service/session-service/agent-context";
import { buildContextPrompt } from "../src/service/agent-service/prompts/graph-prompts";
import { buildTraePrompt } from "../src/service/agent-service/adapters/trae-cli-agent-adapter";

function conversation(id: string, parentId: string | null): Conversation {
  return {
    id,
    session_id: 1,
    workspace_id: "workspace-1",
    parent_conversation_id: parentId,
    title: null,
    state: "completed",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ended_at: null,
    message_count: 1,
    error: null,
    position_x: null,
    position_y: null,
  };
}

function message(
  id: string,
  conversationId: string,
  user: string,
  assistant: string | null,
): Message {
  return {
    id,
    conversation_id: conversationId,
    session_id: 1,
    user_content: user,
    assistant_content: assistant,
    thinking_content: null,
    content_blocks: null,
    status: "completed",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("parent-chain context", () => {
  it("collects ancestors from root to direct parent and excludes the current conversation", () => {
    const dao = new ConversationDAO();
    const conversations = new Map([
      ["root", conversation("root", null)],
      ["parent", conversation("parent", "root")],
      ["current", conversation("current", "parent")],
    ]);
    vi.spyOn(dao, "getConversationById").mockImplementation(
      (id) => conversations.get(id) ?? null,
    );

    expect(dao.getParentChainConversationIds("current")).toEqual([
      "root",
      "parent",
    ]);
    expect(dao.getParentChainConversationIds("root")).toEqual([]);
  });

  it("keeps messages grouped in ancestor-chain order", () => {
    const dao = new ConversationDAO();
    const conversations = new Map([
      ["root", conversation("root", null)],
      ["parent", conversation("parent", "root")],
      ["current", conversation("current", "parent")],
    ]);
    vi.spyOn(dao, "getConversationById").mockImplementation(
      (id) => conversations.get(id) ?? null,
    );
    vi.spyOn(dao, "getMessagesByConversation").mockImplementation((id) => [
      message(`${id}-message`, id, `${id}-user`, `${id}-assistant`),
    ]);

    expect(
      dao.getParentChainMessages("current").map((item) => item.conversation_id),
    ).toEqual(["root", "parent"]);
  });

  it("converts stored rows to agent role messages", () => {
    expect(
      toAgentContextMessages([
        message("message-1", "root", "question", "answer"),
      ]),
    ).toEqual([
      { role: "user", content: "question" },
      { role: "assistant", content: "answer" },
    ]);
  });

  it("renders the normalized context for both agent adapters", async () => {
    const parentChainMessages = toAgentContextMessages([
      message("message-1", "root", "question", "answer"),
    ]);
    const builtinPrompt = await buildContextPrompt(
      parentChainMessages,
      [],
      "current task",
    );
    const traePrompt = buildTraePrompt({
      userMessage: "current task",
      workspaceId: "workspace-1",
      workspaceDir: ".",
      conversationId: "current",
      sessionId: "1",
      messageId: "message-2",
      parentChainMessages,
      currentConversationMessages: [],
      signal: new AbortController().signal,
      cancelCheck: () => undefined,
      publish: async () => undefined,
    });

    expect(builtinPrompt).toContain("user: question");
    expect(builtinPrompt).toContain("assistant: answer");
    expect(builtinPrompt).not.toContain("undefined");
    expect(traePrompt).toContain("User: question");
    expect(traePrompt).toContain("Assistant: answer");
  });

  it("asserts that parent and current context do not overlap", () => {
    const duplicate = message("message-1", "current", "question", "answer");

    expect(() =>
      assertContextMessagesDisjoint([duplicate], [duplicate]),
    ).toThrow(
      "Parent-chain context contains current-conversation messages: message-1",
    );
  });
});
