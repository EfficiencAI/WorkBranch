import { Layout, Menu, Space, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { GlobalStatusBar } from '../../widgets/status-bar/GlobalStatusBar'

const navItems: MenuProps['items'] = [
  {
    key: '/workspace',
    label: '工作台',
  },
  {
    key: '/settings',
    label: '设置',
  },
]

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Layout className="app-layout">
      <Layout.Header className="app-header">
        <div className="app-header__inner">
          <Space direction="vertical" size={0}>
            <Typography.Text className="app-header__eyebrow">WorkBranch Frontend</Typography.Text>
            <Typography.Title level={4} className="app-header__title">
              应用基础框架
            </Typography.Title>
          </Space>
          <Menu
            mode="horizontal"
            selectedKeys={[location.pathname]}
            items={navItems}
            onClick={({ key }) => navigate(key)}
            className="app-header__menu"
          />
        </div>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Outlet />
      </Layout.Content>
      <GlobalStatusBar />
    </Layout>
  )
}
