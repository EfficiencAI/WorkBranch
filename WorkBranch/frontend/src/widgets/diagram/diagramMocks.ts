import type { MessageNode } from '../../entities/message-node/model/types'
import type { SessionSummary } from '../../entities/session/model/types'
import type { UserProfile } from '../../entities/user/model/types'

type StaticTone = 'default' | 'success' | 'warning' | 'error' | 'processing'

type CanvasPosition = {
  left: string
  top: string
}

export type SessionListItem = SessionSummary & {
  preview: string
  statusLabel: string
  tone: StaticTone
}

export type CanvasMessage = MessageNode & {
  title: string
  summary: string
  statusLabel: string
  tone: StaticTone
  position: CanvasPosition
}

export type ConversationDetail = {
  conversationId: string
  sessionId: string
  sessionTitle: string
  title: string
  workspaceId: string
  status: string
  createdAt: string
  updatedAt: string
  nodeCount: number
  branchCount: number
}

export const currentConversationDetail: ConversationDetail = {
  conversationId: 'conversation-001',
  sessionId: 'session-001',
  sessionTitle: '阶段四：全屏图界面静态重构',
  title: '阶段四：全屏图界面静态重构 / 当前对话',
  workspaceId: 'workspace-demo-001',
  status: '静态预览中',
  createdAt: '2026-03-26 09:10',
  updatedAt: '2026-03-26 10:48',
  nodeCount: 4,
  branchCount: 2,
}

export const mockUser: UserProfile = {
  id: 'user-demo',
  name: 'Misak',
}

export const mockSessions: SessionListItem[] = [
  {
    id: 'session-001',
    title: currentConversationDetail.sessionTitle,
    preview: '切换为悬浮入口、覆盖侧栏、全屏会话图。',
    statusLabel: '当前会话',
    tone: 'processing',
    status: 'active',
    updatedAt: '刚刚',
  },
  {
    id: 'session-002',
    title: '设置树递归编辑联调',
    preview: '检查 settings 叶子节点提交与回显。',
    statusLabel: '已完成',
    tone: 'success',
    status: 'done',
    updatedAt: '10 分钟前',
  },
  {
    id: 'session-003',
    title: '共享 API 层整理',
    preview: '统一 get/patch 封装与错误处理。',
    statusLabel: '待继续',
    tone: 'warning',
    status: 'pending',
    updatedAt: '35 分钟前',
  },
  {
    id: 'session-004',
    title: 'React Flow 树图准备',
    preview: '为后续真实节点、边与 fitView 交互预留结构。',
    statusLabel: '草稿',
    tone: 'default',
    status: 'draft',
    updatedAt: '昨天',
  },
]

export const mockMessages: CanvasMessage[] = [
  {
    id: 'node-001',
    parentId: null,
    role: 'system',
    title: '系统上下文',
    summary: '当前阶段先修正全屏主视口与图层关系，不接真实数据与状态管理。',
    content: '先完成全屏会话图、悬浮入口、覆盖侧栏、图内详情与图内新建节点输入区。',
    createdAt: '09:12',
    status: 'completed',
    statusLabel: '已就绪',
    tone: 'success',
    position: { left: '8%', top: '18%' },
  },
  {
    id: 'node-002',
    parentId: 'node-001',
    role: 'user',
    title: '用户需求',
    summary: '图必须成为主画面，不能继续被页面块和减高规则挤占。',
    content: '进入图界面后应首先看到完整图面；侧栏、HUD、详情都应该覆盖在图上，而不是压缩图。',
    createdAt: '09:15',
    status: 'streaming',
    statusLabel: '当前聚焦源',
    tone: 'processing',
    position: { left: '28%', top: '30%' },
  },
  {
    id: 'node-003',
    parentId: 'node-002',
    role: 'assistant',
    title: '实现建议',
    summary: '保留 overlay 结构，但让图视口直接占满图界面，并为后续 React Flow 保留语义入口。',
    content: '缩放控件保持 zoomIn/zoomOut/fitView 语义；后续树图阶段将把真实节点数据映射到 React Flow nodes/edges。',
    createdAt: '09:18',
    status: 'completed',
    statusLabel: '主分支',
    tone: 'success',
    position: { left: '52%', top: '20%' },
  },
  {
    id: 'node-004',
    parentId: 'node-002',
    role: 'assistant',
    title: '后续树图阶段',
    summary: 'React Flow 已是既定方案，下一阶段接入真实树图渲染与视口能力。',
    content: '届时会补齐节点/边转换、拖拽缩放、fitView 与真实会话数据联动，而不是继续停留在静态图感。',
    createdAt: '09:19',
    status: 'error',
    statusLabel: '既定路线',
    tone: 'warning',
    position: { left: '66%', top: '46%' },
  },
]

export function getSelectedNode(nodeId: string) {
  return mockMessages.find((message) => message.id === nodeId) ?? mockMessages[1]
}
