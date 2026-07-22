import assert from "node:assert/strict";
import type { Message } from "../../data";

type StoredContextMessage = Pick<
  Message,
  "id" | "user_content" | "assistant_content"
>;

export function assertContextMessagesDisjoint(
  parentChainMessages: StoredContextMessage[],
  currentConversationMessages: StoredContextMessage[],
): void {
  const currentMessageIds = new Set(
    currentConversationMessages.map((message) => message.id),
  );
  const duplicateMessageIds = parentChainMessages
    .filter((message) => currentMessageIds.has(message.id))
    .map((message) => message.id);

  assert.deepEqual(
    duplicateMessageIds,
    [],
    `Parent-chain context contains current-conversation messages: ${duplicateMessageIds.join(", ")}`,
  );
}

export function toAgentContextMessages(
  messages: StoredContextMessage[],
): Array<Record<string, unknown>> {
  const contextMessages: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    if (message.user_content) {
      contextMessages.push({ role: "user", content: message.user_content });
    }
    if (message.assistant_content) {
      contextMessages.push({
        role: "assistant",
        content: message.assistant_content,
      });
    }
  }

  return contextMessages;
}
