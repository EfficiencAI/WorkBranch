import { SegmentType } from '../../../session-service/canonical';
import { toolRegistry } from '../../tools/registry';
import { logger } from '../../../../core/logging';

export const FILE_TOOLS = new Set(['read_file', 'write_file', 'delete_file', 'list_dir', 'create_dir', 'read_document']);
export const EXPLORE_TOOLS = new Set(['explore_code', 'explore_internet']);
export const SUBAGENT_TOOLS = new Set(['call_explore_agent', 'call_review_agent']);
export const WORKSPACE_TOOLS = new Set(['list_workspace_files', 'get_workspace_info', 'search_files']);
export const TODO_TOOLS = new Set(['update_todo']);
export const MODE_TOOLS = new Set(['switch_execution_mode']);

export const SPECIAL_TOOLS: Record<string, {
  start_type: SegmentType;
  delta_type: SegmentType;
  end_type: SegmentType;
  content_field: string;
}> = {
  thinking: {
    start_type: SegmentType.THINKING_START,
    delta_type: SegmentType.THINKING_DELTA,
    end_type: SegmentType.THINKING_END,
    content_field: 'thinking_content',
  },
  chat: {
    start_type: SegmentType.CHAT_START,
    delta_type: SegmentType.CHAT_DELTA,
    end_type: SegmentType.CHAT_END,
    content_field: 'chat_content',
  },
};

function summarizeText(value: unknown, limit: number = 160): string {
  let raw: string;
  if (value === null || value === undefined) {
    raw = '';
  } else if (typeof value === 'string') {
    raw = value;
  } else {
    try {
      raw = JSON.stringify(value);
    } catch {
      raw = String(value);
    }
  }
  const compact = raw.split(/\s+/).join(' ');
  if (compact.length <= limit) return compact;
  return compact.slice(0, limit - 3) + '...';
}

export function writeToolEvent(
  conversationId: string | undefined,
  toolName: string,
  status: 'started' | 'completed' | 'failed',
  options?: {
    taskDescription?: string;
    result?: string;
    error?: string;
  },
): void {
  if (!conversationId) return;

  const payload: Record<string, unknown> = {
    tool_name: toolName,
    status,
  };

  let summary = '';
  if (status === 'started') {
    summary = summarizeText(options?.taskDescription || `started ${toolName}`);
  } else if (status === 'completed') {
    summary = summarizeText(options?.result || `completed ${toolName}`);
  } else if (status === 'failed') {
    summary = summarizeText(options?.error || `failed ${toolName}`);
  }

  if (summary) payload.summary = summary;
  if (options?.error) payload.error = summarizeText(options.error);

  logger.info({
    event: 'tool_event',
    conversation_id: conversationId,
    payload,
  });
}

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  director_agent: [
    'read_file', 'write_file', 'delete_file', 'list_dir', 'create_dir',
    'explore_code', 'explore_internet', 'thinking', 'chat',
    'call_explore_agent', 'call_review_agent',
    'list_workspace_files', 'get_workspace_info', 'search_files',
    'update_todo', 'switch_execution_mode', 'read_document',
  ],
  plan_agent: [
    'read_file', 'write_file', 'list_dir', 'explore_code', 'thinking', 'chat',
    'call_explore_agent', 'call_review_agent', 'read_document', 'switch_execution_mode',
  ],
  review_agent: ['read_file', 'list_dir', 'explore_code', 'thinking', 'chat'],
  explore_agent: [
    'read_file', 'list_dir', 'thinking', 'chat', 'explore_internet',
    'list_workspace_files', 'get_workspace_info', 'search_files',
  ],
  admin_agent: [
    'read_file', 'write_file', 'delete_file', 'list_dir', 'create_dir',
    'explore_code', 'explore_internet', 'thinking', 'chat',
    'call_explore_agent', 'call_review_agent',
    'list_workspace_files', 'get_workspace_info', 'search_files',
  ],
};

export function getAllowedTools(agentType: string, webSearchEnabled: boolean = true): string[] {
  const allowed = DEFAULT_PERMISSIONS[agentType] || DEFAULT_PERMISSIONS['director_agent'];
  if (!webSearchEnabled) {
    return allowed.filter((tool) => tool !== 'explore_internet');
  }
  return allowed;
}

export function isToolAllowed(toolName: string, agentType: string, webSearchEnabled: boolean = true): boolean {
  return getAllowedTools(agentType, webSearchEnabled).includes(toolName);
}

export function filterToolsByAgentType(agentType: string): Array<Record<string, unknown>> {
  const allowedTools = getAllowedTools(agentType);
  const allTools = toolRegistry.list();
  return allTools
    .filter(t => allowedTools.includes(t.name))
    .map(t => ({ name: t.name, description: t.description, params: t.params }));
}

export function generateToolPrompt(agentType: string): string {
  const allowedTools = getAllowedTools(agentType);
  return toolRegistry.generateToolPrompt(allowedTools);
}

export function isSpecialTool(toolName: string): boolean {
  return toolName in SPECIAL_TOOLS;
}
