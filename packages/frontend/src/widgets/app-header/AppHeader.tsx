import { Button, Layout, Menu, Space, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { StatusTag } from '../../shared/ui'

const navItems: MenuProps['items'] = [
  {
    key: '/chat',
    label: '图',
  },
  {
    key: '/settings',
    label: '设置',
  },
]

export function AppHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const diagramTitle = location.pathname === '/chat' ? '图' : '系统设置'

  return (
    <Layout.Header className="app-header">
      <div className="app-header__inner">
        <Space direction="vertical" size={0}>
          <Typography.Text className="app-header__eyebrow">WorkBranch Frontend</Typography.Text>
          <Space size="middle" wrap>
            <Typography.Title level={4} className="app-header__title">
              {diagramTitle}
            </Typography.Title>
            <StatusTag label="阶段四" tone="processing" />
            <StatusTag label="静态 UI" tone="success" />
          </Space>
        </Space>

        <Menu
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={navItems}
          onClick={({ key }) => navigate(key)}
          className="app-header__menu"
        />

        <Space wrap>
          <Button>新建会话</Button>
          <Button>刷新</Button>
          <Button type="primary" onClick={() => navigate('/settings')}>
            设置
          </Button>
        </Space>
      </div>
    </Layout.Header>
  )
}
