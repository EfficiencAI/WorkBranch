import type { AgentState } from '../../state/agent-state';
import { SegmentType } from '../../../session-service/canonical';

export interface FinalizeNodeOptions {
  messageContext?: Record<string, unknown>;
}

export function createFinalizeNode(options: FinalizeNodeOptions = {}) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const text = state.pending_final_text || state.final_reply || '';
    const sendMessage = (options.messageContext?.send_message as
      | ((content: string, type: SegmentType, metadata?: Record<string, unknown>) => Promise<void>)
      | undefined);

    if (sendMessage) {
      await sendMessage('', SegmentType.CHAT_START, {
        task_description: '输出最终回复',
        is_start: true,
      });
      if (text) {
        await sendMessage(text, SegmentType.CHAT_DELTA, {
          task_description: '输出最终回复',
          is_delta: true,
        });
      }
      await sendMessage('', SegmentType.CHAT_END, {
        task_description: '输出最终回复',
        is_end: true,
        result: text,
      });
    }

    return {
      final_reply: text,
      pending_final_text: text,
      has_tool_use: false,
      pending_tools: [],
      pending_batch: null,
      _route_target: 'done',
    };
  };
}
