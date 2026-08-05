import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { selectAuthToken, selectAuthUser, useAuthStore } from '../../features/auth'

/**
 * 登录守卫：未登录（含本地离线用户未登录）时重定向到 /auth，
 * 并记录来源路径，登录后可跳回。已登录时渲染子路由。
 */
export function RequireAuth() {
  const user = useAuthStore(selectAuthUser)
  const token = useAuthStore(selectAuthToken)
  const loadSession = useAuthStore((state) => state.loadSession)
  const location = useLocation()
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function ensureSession() {
      if (!user && token) {
        setChecking(true)
        await loadSession()
        if (!cancelled) {
          setChecking(false)
        }
      }
    }
    void ensureSession()
    return () => {
      cancelled = true
    }
  }, [user, token, loadSession])

  if (checking) {
    return null
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
