import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { selectAuthToken, selectAuthUser, useAuthStore } from '../../features/auth'

/**
 * 登录守卫：未登录（含本地离线用户未登录）时重定向到 /auth，
 * 并记录来源路径，登录后可跳回。已登录时渲染子路由。
 *
 * 检查态直接由 token / user 派生，避免刷新时首帧误跳登录页，
 * 也不依赖异步 effect 的取消标志（严格模式下会与状态更新产生竞态）。
 */
export function RequireAuth() {
  const user = useAuthStore(selectAuthUser)
  const token = useAuthStore(selectAuthToken)
  const loadSession = useAuthStore((state) => state.loadSession)
  const location = useLocation()
  const sessionPending = Boolean(token && !user)

  useEffect(() => {
    if (sessionPending) {
      void loadSession()
    }
  }, [sessionPending, loadSession])

  if (sessionPending) {
    return (
      <div className="wa-session-loading" aria-busy="true">
        <span className="wa-session-loading__spinner" aria-hidden="true" />
        <span>正在恢复会话…</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
