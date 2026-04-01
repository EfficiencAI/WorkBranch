import type { MenuProps } from 'antd'

export type MenuKey = 'create-root-conversation' | 'create-child-conversation' | 'delete-conversation'

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
  ],
  node: [
    {
      key: 'create-child-conversation',
      label: '创建子对话',
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
