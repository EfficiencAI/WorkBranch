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
      // Only handle left mouse button
      if (event.button !== 0) return

      // Check if the click is outside the menu
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        // Prevent event propagation to avoid conflicts with ReactFlow
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

    // Add listeners with capture phase to ensure we get the event before ReactFlow
    document.addEventListener('mousedown', handleMouseDownOutside, true)
    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('mousedown', handleMouseDownOutside, true)
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
  onSelectConversation: (conversationId: string) => void
  onCreateConversation: (parentConversationId: string | null) => Promise<void>
  onDeleteConversation: (conversationId: string) => Promise<void>
  onAutoArrange: () => Promise<void>
}

export function ContextMenu({ onSelectConversation, onCreateConversation, onDeleteConversation, onAutoArrange }: ContextMenuProps) {
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

      if (menuKey === 'select-conversation-for-send' && contextMenu.conversationId) {
        onSelectConversation(contextMenu.conversationId)
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
