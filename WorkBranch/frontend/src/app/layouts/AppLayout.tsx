import { Layout } from 'antd'
import { Outlet } from 'react-router-dom'
import { AppHeader } from '../../widgets/app-header/AppHeader'
import { GlobalStatusBar } from '../../widgets/status-bar/GlobalStatusBar'

export function AppLayout() {
  return (
    <Layout className="app-layout">
      <AppHeader />
      <Layout.Content className="app-content">
        <Outlet />
      </Layout.Content>
      <GlobalStatusBar />
    </Layout>
  )
}
