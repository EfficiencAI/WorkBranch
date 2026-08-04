import { Button, Layout, Space, Typography } from 'antd'
import { Outlet, useNavigate } from 'react-router-dom'
import { selectAuthUser, useAuthStore } from '../../features/auth'

export function WorkAssistantLayout() {
  const navigate = useNavigate()
  const user = useAuthStore(selectAuthUser)
  const logout = useAuthStore((state) => state.logout)

  const handleLogout = async () => {
    await logout()
    navigate('/auth')
  }

  return (
    <Layout className="wa-layout">
      <Layout.Header className="wa-header">
        <Space>
          <span className="wa-logo">WA</span>
          <Typography.Text strong>WorkAssistant</Typography.Text>
          <Typography.Text type="secondary" className="wa-header-desc">
            企业内部 AI 助手中心
          </Typography.Text>
        </Space>
        <Space>
          {user ? <Typography.Text type="secondary">{user.name}</Typography.Text> : null}
          {user ? (
            <Button size="small" type="text" onClick={handleLogout}>
              退出
            </Button>
          ) : (
            <Button size="small" type="primary" onClick={() => navigate('/auth')}>
              登录
            </Button>
          )}
        </Space>
      </Layout.Header>
      <Layout.Content className="wa-content">
        <Outlet />
      </Layout.Content>
    </Layout>
  )
}
