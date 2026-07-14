import { Menu } from 'antd'
import type { MenuProps } from 'antd'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getMenuItems, type MenuKey } from './menuConfig'

export type ContextMenuState = {
  type: 'canvas' | 'node'
  conversationId?: string
  position: { x: number; y: number }
} | null

type ContextMenuContextValue = {
  contextMenu: ContextMenuState
  setContextMenu: (state: ContextMenuState) => void
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null)

export function useContextMenu() {
  const context = useContext(ContextMenuContext)
  if (!context) {
    throw new Error('useContextMenu must be used within ContextMenuProvider')
  }
  return context
}

function useMenuClose(menuRef: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const handleMouseDownOutside = (event: MouseEvent) => {
      if (event.button !== 0) return

      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        event.stopPropagation()
        onClose()
      }
    }

    const handleTouchStartOutside = (event: TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        event.stopPropagation()
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    document.addEventListener('mousedown', handleMouseDownOutside, true)
    document.addEventListener('touchstart', handleTouchStartOutside, true)
    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('mousedown', handleMouseDownOutside, true)
      document.removeEventListener('touchstart', handleTouchStartOutside, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [menuRef, onClose])
}

type ContextMenuProviderProps = {
  children: React.ReactNode
}

export function ContextMenuProvider({ children }: ContextMenuProviderProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  return (
    <ContextMenuContext.Provider value={{ contextMenu, setContextMenu }}>
      {children}
    </ContextMenuContext.Provider>
  )
}

type ContextMenuProps = {
  lockedSendConversationId: string | null
  onSelectConversation: (conversationId: string) => void
  onUnlockConversation: () => void
  onCreateConversation: (parentConversationId: string | null) => Promise<void>
  onDeleteConversation: (conversationId: string) => Promise<void>
  onAutoArrange: () => Promise<void>
}

export function ContextMenu({
  lockedSendConversationId,
  onSelectConversation,
  onUnlockConversation,
  onCreateConversation,
  onDeleteConversation,
  onAutoArrange,
}: ContextMenuProps) {
  const { contextMenu, setContextMenu } = useContextMenu()
  const menuRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => {
    setContextMenu(null)
  }, [setContextMenu])

  useMenuClose(menuRef, handleClose)

  const handleMenuClick = useCallback(
    async ({ key }: { key: string }) => {
      if (!contextMenu) return

      const menuKey = key as MenuKey
      handleClose()

      if (menuKey === 'lock-conversation-for-send' && contextMenu.conversationId) {
        onSelectConversation(contextMenu.conversationId)
      } else if (menuKey === 'unlock-conversation-for-send') {
        onUnlockConversation()
      } else if (menuKey === 'create-root-conversation') {
        await onCreateConversation(null)
      } else if (menuKey === 'create-child-conversation' && contextMenu.conversationId) {
        await onCreateConversation(contextMenu.conversationId)
      } else if (menuKey === 'auto-arrange-conversations') {
        await onAutoArrange()
      } else if (menuKey === 'delete-conversation' && contextMenu.conversationId) {
        await onDeleteConversation(contextMenu.conversationId)
      }
    },
    [contextMenu, onSelectConversation, onCreateConversation, onDeleteConversation, onAutoArrange, handleClose],
  )

  if (!contextMenu) return null

  const menuItems: MenuProps['items'] = (() => {
    const baseItems = getMenuItems(contextMenu.type) ?? []
    if (contextMenu.type !== 'node' || !contextMenu.conversationId) return baseItems

    return baseItems.map((item) => {
      if (item?.key === 'lock-conversation-for-send' && lockedSendConversationId === contextMenu.conversationId) {
        return { ...item, key: 'unlock-conversation-for-send' as MenuKey, label: '取消发送节点锁定' }
      }
      if (item?.key === 'lock-conversation-for-send' && lockedSendConversationId) {
        return { ...item, label: '切换锁定到此节点' }
      }
      return item
    })
  })()

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: 'fixed',
        left: contextMenu.position.x,
        top: contextMenu.position.y,
        zIndex: 1000,
        borderRadius: '4px',
        overflow: 'hidden',
        border: '1px solid var(--app-border)',
        background: 'var(--app-card-bg)',
        boxShadow: 'var(--app-shadow-sm)',
      }}
    >
      <Menu items={menuItems} onClick={handleMenuClick} />
    </div>
  )
}
