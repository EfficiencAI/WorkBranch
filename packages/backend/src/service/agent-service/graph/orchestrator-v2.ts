import { runDirectorGraph, type MessageContext as DirectorMessageContext } from './director-agent';
import { SegmentType } from '../../session-service/canonical';
import { logger } from '../../../core/logging';

export interface MessageContext {
  send_message: (content: string, type: SegmentType) => Promise<void>;
  session_id: string;
  conversation_id: string;
  workspace_id: string;
  message_id: string;
}

export async function runOrchestrator(
  userMessage: string,
  workspaceId: string,
  context: MessageContext
): Promise<void> {
  logger.info({
    event: 'orchestrator.started',
    workspace_id: workspaceId,
    conversation_id: context.conversation_id,
  });

  try {
    const directorContext: DirectorMessageContext = {
      send_message: context.send_message,
      session_id: context.session_id,
      conversation_id: context.conversation_id,
      workspace_id: context.workspace_id,
      message_id: context.message_id,
    };

    await runDirectorGraph(
      userMessage,
      workspaceId,
      directorContext,
    );

    logger.info({
      event: 'orchestrator.completed',
      workspace_id: workspaceId,
    });
  } catch (err) {
    logger.error({
      event: 'orchestrator.failed',
      workspace_id: workspaceId,
      error: String(err),
    });

    context.send_message(`执行失败: ${String(err)}`, SegmentType.ERROR);
  }
}
