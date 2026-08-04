import { Tooltip } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

/**
 * 产品壳：悬浮菜单栏承载 WB / WA 两个产品 logo，点击切换。
 * WorkBranch 与 WorkAssistant 各自独立导航，可互相跳转；访客端不经过此壳。
 */
export function ProductShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const isWorkAssistant = location.pathname.startsWith('/assistant')

  return (
    <div className="product-shell">
      <nav className="product-rail" aria-label="产品切换">
        <Tooltip title="WorkBranch 工作台" placement="right">
          <button
            type="button"
            className={`product-rail-btn product-rail-btn--wb${isWorkAssistant ? '' : ' active'}`}
            onClick={() => navigate('/chat')}
          >
            WB
          </button>
        </Tooltip>
        <Tooltip title="WorkAssistant 助手中心" placement="right">
          <button
            type="button"
            className={`product-rail-btn product-rail-btn--wa${isWorkAssistant ? ' active' : ''}`}
            onClick={() => navigate('/assistant')}
          >
            WA
          </button>
        </Tooltip>
      </nav>
      <div className="product-shell-content">
        <Outlet />
      </div>
    </div>
  )
}
