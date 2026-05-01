import type { ToolDefinition } from './types';
import { toolRegistry } from './registry';

export const AGENT_TOOLS: Record<string, ToolDefinition> = {
  spawn_agent: {
    name: 'spawn_agent',
    description: '启动一个子 Agent 执行特定任务。支持 explore(代码探索)、plan(规划)、review(代码审查) 等类型。',
    params: 'spawn_agent:{"agent_type":"(explore|plan|review|general-purpose)","task_description":"(任务描述)","tools":"(可选工具列表)","background":"(是否后台运行，默认false)"}',
    category: 'agent',
    executor: async () => ({ result: null, error: null }),
  },
  send_message_to_agent: {
    name: 'send_message_to_agent',
    description: '向正在运行的子 Agent 发送消息，继续或修正其任务。',
    params: 'send_message_to_agent:{"agent_id":"(子Agent ID)","message":"(消息内容)"}',
    category: 'agent',
    executor: async () => ({ result: null, error: null }),
  },
  stop_agent: {
    name: 'stop_agent',
    description: '停止正在运行的子 Agent。',
    params: 'stop_agent:{"agent_id":"(子Agent ID)"}',
    category: 'agent',
    executor: async () => ({ result: null, error: null }),
  },
  list_agents: {
    name: 'list_agents',
    description: '列出当前正在运行的所有子 Agent。',
    params: 'list_agents:{}',
    category: 'agent',
    executor: async () => ({ result: null, error: null }),
  },
};

export function registerAgentTools(): void {
  for (const toolDef of Object.values(AGENT_TOOLS)) {
    toolRegistry.register(toolDef);
  }
}
