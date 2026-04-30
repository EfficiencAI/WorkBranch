import type { MenuProps } from 'antd'

export type MenuKey =
  | 'select-conversation-for-send'
  | 'create-root-conversation'
  | 'create-child-conversation'
  | 'delete-conversation'
  | 'auto-arrange-conversations'

export type MenuItem = {
  key: MenuKey
  label: string
}

export const MENU_CONFIG: Record<'canvas' | 'node', MenuItem[]> = {
  canvas: [
    {
      key: 'create-root-conversation',
      label: '创建根对话',
    },
    {
      key: 'auto-arrange-conversations',
      label: '一键规整',
    },
  ],
  node: [
    {
      key: 'select-conversation-for-send',
      label: '选中为消息发送节点',
    },
    {
      key: 'create-child-conversation',
      label: '创建子对话',
    },
    {
      key: 'auto-arrange-conversations',
      label: '一键规整',
    },
    {
      key: 'delete-conversation',
      label: '删除节点',
    },
  ],
}

export function getMenuItems(type: 'canvas' | 'node'): MenuProps['items'] {
  return MENU_CONFIG[type]
}
