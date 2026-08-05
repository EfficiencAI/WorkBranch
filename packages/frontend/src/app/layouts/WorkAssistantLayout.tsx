import { Button, Layout, Space, Tag, Tooltip, Typography } from 'antd'
import { HomeOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons'
import { useMemo } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { selectAuthToken, selectAuthUser, useAuthStore } from '../../features/auth'
import { LOCAL_OFFLINE_TOKEN } from '../../shared/api/config'
import { ProductRail } from '../../widgets'
import type { ProductId } from '../../widgets'

export function WorkAssistantLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore(selectAuthUser)
  const token = useAuthStore(selectAuthToken)
  const logout = useAuthStore((state) => state.logout)
  const isLocalOffline = token === LOCAL_OFFLINE_TOKEN

  const pageMeta = useMemo(() => {
    if (location.pathname.startsWith('/assistant/new')) {
      return { title: '新建助手', subtitle: '填写基本信息，创建后进入训练页' }
    }
    if (/^\/assistant\/[^/]+$/.test(location.pathname)) {
      return { title: '助手详情', subtitle: '查看与训练你的 AI 助手' }
    }
    return { title: '助手中心', subtitle: '把知识沉淀成可并发接待的 AI 分身' }
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    navigate('/auth')
  }

  const handleProductSwitch = (next: ProductId) => {
    if (next === 'wb') {
      navigate('/chat')
    }
  }

  return (
    <Layout className="wa-layout">
      {user ? (
        <ProductRail product="wa" onSwitch={handleProductSwitch}>
          <Tooltip title="助手中心" placement="right">
            <Button
              type="text"
              className={`diagram-shell__rail-button ${location.pathname === '/assistant' ? 'diagram-shell__rail-button--active' : ''}`}
              aria-label="助手中心"
              icon={<HomeOutlined />}
              onClick={() => navigate('/assistant')}
            />
          </Tooltip>
          <Tooltip title="新建助手" placement="right">
            <Button
              type="text"
              className={`diagram-shell__rail-button ${location.pathname.startsWith('/assistant/new') ? 'diagram-shell__rail-button--active' : ''}`}
              aria-label="新建助手"
              icon={<PlusOutlined />}
              onClick={() => navigate('/assistant/new')}
            />
          </Tooltip>
          <Tooltip title="设置" placement="right">
            <Button
              type="text"
              className={`diagram-shell__rail-button ${location.pathname === '/settings' ? 'diagram-shell__rail-button--active' : ''}`}
              aria-label="设置"
              icon={<SettingOutlined />}
              onClick={() => navigate('/settings')}
            />
          </Tooltip>
        </ProductRail>
      ) : null}
      <Layout.Header className="wa-header">
        <div className="wa-header__title">
          <Typography.Text className="wa-header__title-main">{pageMeta.title}</Typography.Text>
          <Typography.Text type="secondary" className="wa-header__subtitle">
            {pageMeta.subtitle}
          </Typography.Text>
        </div>
        <Space size="middle">
          {user ? (
            <>
              {isLocalOffline ? (
                <Tag className="wa-header__offline-tag" bordered={false}>
                  本地
                </Tag>
              ) : null}
              <Typography.Text type="secondary">{user.name}</Typography.Text>
            </>
          ) : null}
          <Button size="small" type="text" onClick={handleLogout}>
            退出
          </Button>
        </Space>
      </Layout.Header>
      <Layout.Content className="wa-content">
        <Outlet />
      </Layout.Content>
    </Layout>
  )
}
