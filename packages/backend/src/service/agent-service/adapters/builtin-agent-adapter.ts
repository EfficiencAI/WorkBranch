import { runAgentGraph } from '../graph/agent-graphs';
import type { AgentAdapter, AgentAdapterContext, AgentId } from './types';

export class BuiltinAgentAdapter implements AgentAdapter {
  id: AgentId = 'builtin';

  async run(context: AgentAdapterContext) {
    return runAgentGraph(
      'director_agent',
      context.userMessage,
      context.workspaceId,
      {
        send_message: context.publish,
        session_id: context.sessionId,
        conversation_id: context.conversationId,
        workspace_id: context.workspaceId,
        message_id: context.messageId,
        cancel_check: context.cancelCheck,
      },
      context.parentChainMessages,
      context.currentConversationMessages,
      undefined,
      false,
      context.webSearchEnabled,
    );
  }
}
