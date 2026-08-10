import { Button, Tooltip } from 'antd'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useResponsive } from '../../shared/lib'

export type ProductId = 'wb' | 'wa'

const PRODUCT_META: Record<ProductId, { label: string; name: string; altLabel: string; altName: string }> = {
  wb: { label: 'WB', name: 'WorkBranch', altLabel: 'WA', altName: 'WorkAssistant' },
  wa: { label: 'WA', name: 'WorkAssistant', altLabel: 'WB', altName: 'WorkBranch' },
}

type ProductRailProps = {
  product: ProductId
  onSwitch: (next: ProductId) => void
  className?: string
  children?: ReactNode
}

/**
 * 产品悬浮菜单：对原始 diagram-shell__nav（WB 品牌按钮 + 菜单图标）的增强。
 * 默认只显示当前产品一个按钮；点击后菜单图标收起、悬浮栏水平展开露出另一个产品；
 * 选中后另一个产品左滑覆盖当前产品，并通过 onSwitch 完成跳转（局部刷新）。
 * 菜单图标由使用方作为 children 传入（WB 页面传对话图/会话历史/设置等）。
 */
export function ProductRail({ product, onSwitch, className = '', children }: ProductRailProps) {
  const railRef = useRef<HTMLElement>(null)
  const responsive = useResponsive()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)

  const meta = PRODUCT_META[product]
  const other: ProductId = product === 'wb' ? 'wa' : 'wb'
  const otherMeta = PRODUCT_META[other]

  useEffect(() => {
    if (!open) return
    function handleDocumentClick(event: MouseEvent) {
      const node = railRef.current
      if (node && !node.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [open])

  function toggleOpen() {
    if (switching) return
    setOpen((prev) => !prev)
  }

  function handleSwitch() {
    if (!open || switching) return
    setSwitching(true)
    setOpen(false)
    window.setTimeout(() => {
      setSwitching(false)
      onSwitch(other)
    }, 400)
  }

  const navClassName = [
    'diagram-shell__nav',
    responsive.isMobile ? 'diagram-shell__nav--mobile' : null,
    className || null,
    open ? 'is-expanded' : null,
    switching ? 'is-switching' : null,
  ].filter(Boolean).join(' ')

  return (
    <nav ref={railRef} className={navClassName} aria-label="产品切换" aria-expanded={open}>
      <div className="product-switch">
        <Tooltip title={responsive.isMobile ? null : `${meta.name}（当前产品）`} placement="bottom">
          <Button
            type="text"
            className="diagram-shell__brand is-current"
            aria-label={`${meta.name}（当前产品）`}
            onClick={toggleOpen}
          >
            {meta.label}
          </Button>
        </Tooltip>
        <Tooltip title={responsive.isMobile ? null : `切换到 ${otherMeta.name}`} placement="bottom">
          <Button
            type="text"
            className="diagram-shell__brand is-alt"
            aria-label={`切换到 ${otherMeta.name}`}
            onClick={handleSwitch}
          >
            {otherMeta.label}
          </Button>
        </Tooltip>
      </div>
      {children ? <div className="rail-menu">{children}</div> : null}
    </nav>
  )
}
