import type { MessageNode } from '../../entities/message-node/model/types'
import type { SessionDetail, SessionSummary } from '../../entities/session/model/types'
import type { UserProfile } from '../../entities/user/model/types'

type StaticTone = 'default' | 'success' | 'warning' | 'error' | 'processing'

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
}

export const currentSessionTitle = '阶段四：静态工作台搭建'
export const currentWorkspaceId = 'workspace-demo-001'

export const mockUser: UserProfile = {
  id: 'user-demo',
  name: 'Misak',
}

export const mockSessions: SessionListItem[] = [
  {
    id: 'session-001',
    title: '阶段四：静态工作台搭建',
    preview: '补齐 AppHeader、SessionSidebar、ConversationCanvas。',
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
    title: '消息树布局草图',
    preview: '为后续 React Flow 节点展示预留结构。',
    statusLabel: '草稿',
    tone: 'default',
    status: 'draft',
    updatedAt: '昨天',
  },
]

export const currentSessionDetail: SessionDetail & {
  workspaceId: string
  nodeCount: number
  branchCount: number
} = {
  id: 'session-001',
  title: currentSessionTitle,
  status: '静态预览中',
  createdAt: '2026-03-25 09:10',
  updatedAt: '2026-03-25 10:48',
  workspaceId: currentWorkspaceId,
  nodeCount: 4,
  branchCount: 2,
}

export const mockMessages: CanvasMessage[] = [
  {
    id: 'node-001',
    parentId: null,
    role: 'system',
    title: '系统上下文',
    summary: '确认阶段四只做静态 UI，不接真实数据与状态管理。',
    content: '请先完成工作台静态结构：头部、会话侧栏、中心内容区、输入区和详情面板。',
    createdAt: '09:12',
    status: 'ready',
    statusLabel: '已就绪',
    tone: 'success',
  },
  {
    id: 'node-002',
    parentId: 'node-001',
    role: 'user',
    title: '用户需求',
    summary: '实现阶段四静态界面。',
    content: '工作台要接近目标线框图，但先不要接 Zustand、SSE 和真实接口。',
    createdAt: '09:15',
    status: 'active',
    statusLabel: '选中节点',
    tone: 'processing',
  },
  {
    id: 'node-003',
    parentId: 'node-002',
    role: 'assistant',
    title: '实现建议',
    summary: '先替换占位组件，再统一样式。',
    content: '建议保留 pages -> widgets -> shared 结构，用静态 mock 数据驱动三栏 UI。',
    createdAt: '09:18',
    status: 'done',
    statusLabel: '主分支',
    tone: 'success',
  },
  {
    id: 'node-004',
    parentId: 'node-002',
    role: 'assistant',
    title: '备选分支',
    summary: '是否提前引入 React Flow。',
    content: '本阶段先保留普通静态内容区，等后续树形模块阶段再接入真实节点图。',
    createdAt: '09:19',
    status: 'draft',
    statusLabel: '分支草稿',
    tone: 'warning',
  },
]

export const selectedNode = mockMessages[1]
