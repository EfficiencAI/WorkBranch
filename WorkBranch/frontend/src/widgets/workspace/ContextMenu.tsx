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
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
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
  onCreateConversation: (parentConversationId: string | null) => Promise<void>
  onDeleteConversation: (conversationId: string) => Promise<void>
}

export function ContextMenu({ onCreateConversation, onDeleteConversation }: ContextMenuProps) {
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

      if (menuKey === 'create-root-conversation') {
        await onCreateConversation(null)
      } else if (menuKey === 'create-child-conversation' && contextMenu.conversationId) {
        await onCreateConversation(contextMenu.conversationId)
      } else if (menuKey === 'delete-conversation' && contextMenu.conversationId) {
        await onDeleteConversation(contextMenu.conversationId)
      }
    },
    [contextMenu, onCreateConversation, onDeleteConversation, handleClose],
  )

  if (!contextMenu) return null

  const menuItems: MenuProps['items'] = getMenuItems(contextMenu.type)

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
