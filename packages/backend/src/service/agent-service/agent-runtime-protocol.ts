import type { SegmentType } from '../session-service/canonical';
import type { AgentState } from './state/agent-state';

/**
 * 云端 Agent（remote adapter）预留契约。
 *
 * 目标：让内置 agent 的本地运行与未来的线上服务共用同一套传输语义，
 * 避免以后加 remote adapter 时回头改图。本文件只定义类型与语义，不实现任何网络逻辑。
 *
 * 事件信封：与现有 `MessageContext.publish`（agent.ts 内 sendMessage）一一对应，
 * 事件类型复用 session-service/canonical 的 SegmentType。
 * 状态契约：AgentState 本身是纯 JSON，checkpoint 可整体序列化传输（全图上云的前提）。
 * 取消契约：AbortSignal 在本地直接中断；网络化时映射为 cancel 消息。
 */
export const AGENT_RUNTIME_PROTOCOL_VERSION = 1;

export interface AgentRuntimeEvent {
  seq: number;
  message_id: string;
  conversation_id: string;
  workspace_id: string;
  type: SegmentType;
  content: string;
  metadata: Record<string, unknown>;
}

export interface AgentRuntimeCheckpoint {
  schema_version: typeof AGENT_RUNTIME_PROTOCOL_VERSION;
  state: AgentState;
}

export interface AgentRuntimeStartRequest {
  agent_id: 'builtin' | 'trae' | 'remote';
  user_message: string;
  workspace_id: string;
  conversation_id: string;
  session_id: string;
  message_id: string;
  parent_chain_messages: Array<Record<string, unknown>>;
  current_conversation_messages: Array<Record<string, unknown>>;
  web_search_enabled: boolean;
  checkpoint?: AgentRuntimeCheckpoint;
}

export interface AgentRuntimeCancelMessage {
  kind: 'cancel';
  message_id: string;
}

export interface AgentRuntimeErrorMessage {
  kind: 'error';
  message_id: string;
  error: string;
}

/**
 * 本地 publish 与远程事件流的共同抽象。
 * 本地实现：直接调用 messageQueue.publish；远程实现：经传输层转发给云端。
 */
export type AgentRuntimeEventSink = (event: AgentRuntimeEvent) => Promise<void>;
