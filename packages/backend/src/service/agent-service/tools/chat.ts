import type { ToolDefinition, ToolResult, ToolExecutionContext } from './types';
import { toolRegistry } from './registry';
import { llmService } from '../service/llm-service';
import { SegmentType } from '../../session-service/canonical';

interface ChatExecutionContext extends ToolExecutionContext {
  parent_chain_messages?: Array<Record<string, unknown>>;
  current_conversation_messages?: Array<Record<string, unknown>>;
  send_message?: (content: string, type: SegmentType, metadata?: Record<string, unknown>) => void;
}

function buildContextPrompt(
  parentChainMessages: Array<Record<string, unknown>>,
  currentConversationMessages: Array<Record<string, unknown>>,
  currentTask: string,
): string {
  const parts: string[] = [];

  if (parentChainMessages.length > 0) {
    parts.push('[历史对话]');
    for (const msg of parentChainMessages) {
      const role = (msg.role as string) || 'user';
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      parts.push(`${role}: ${content}`);
    }
    parts.push('');
  }

  if (currentConversationMessages.length > 0) {
    parts.push('[当前对话内历史]');
    for (const msg of currentConversationMessages) {
      const role = (msg.role as string) || 'user';
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      parts.push(`${role}: ${content}`);
    }
    parts.push('');
  }

  parts.push('[当前任务]');
  parts.push(currentTask);

  return parts.join('\n');
}

async function executeChat(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
  const chatContext = context as ChatExecutionContext;
  const taskDescription = (args.task_description || args.description || args.next_task) as string;
  
  if (!taskDescription) {
    return { result: null, error: '缺少 task_description 参数' };
  }

  try {
    const parentChainMessages = chatContext.parent_chain_messages || [];
    const currentConversationMessages = chatContext.current_conversation_messages || [];

    const fullPrompt = buildContextPrompt(
      parentChainMessages,
      currentConversationMessages,
      taskDescription,
    );

    if (chatContext.send_message) {
      chatContext.send_message('', SegmentType.CHAT_START, {
        task_description: taskDescription,
        is_start: true,
      });
    }

    let result = '';
    const stream = await llmService.chatStream([{ role: 'user', content: fullPrompt }]);
    
    for await (const chunk of stream) {
      result += chunk;
      if (chatContext.send_message) {
        chatContext.send_message(chunk, SegmentType.CHAT_DELTA, {
          task_description: taskDescription,
          is_delta: true,
        });
      }
    }

    if (chatContext.send_message) {
      chatContext.send_message('', SegmentType.CHAT_END, {
        task_description: taskDescription,
        is_end: true,
        result,
      });
    }

    return { result, error: null };
  } catch (err) {
    return { result: null, error: String(err) };
  }
}

const CHAT_TOOL: ToolDefinition = {
  name: 'chat',
  description: '与用户对话工具，用于向用户输出回复',
  params: 'chat:{"next_task":"(回复任务描述，例如：向用户总结xxx并说明xxx)"}',
  category: 'communication',
  executor: executeChat,
};

export function registerChatTool(): void {
  toolRegistry.register(CHAT_TOOL);
}

export { CHAT_TOOL, ChatExecutionContext };
