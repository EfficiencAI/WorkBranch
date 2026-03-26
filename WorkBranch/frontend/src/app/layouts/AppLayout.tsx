import { Layout } from 'antd'
import { Outlet, useLocation } from 'react-router-dom'

export function AppLayout() {
  const location = useLocation()
  const contentClassName =
    location.pathname === '/workspace' ? 'app-content app-content--workspace' : 'app-content'

  return (
    <Layout className="app-layout">
      <Layout.Content className={contentClassName}>
        <Outlet />
      </Layout.Content>
    </Layout>
  )
}
