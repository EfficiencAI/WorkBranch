import { Layout, Space, Typography } from 'antd'
import { useLocation } from 'react-router-dom'
import { StatusTag } from '../../shared/ui'

const pageLabelMap: Record<string, string> = {
  '/chat': '工作台',
  '/settings': '设置',
}

export function GlobalStatusBar() {
  const location = useLocation()
  const pageLabel = pageLabelMap[location.pathname] ?? '工作台'

  return (
    <Layout.Footer className="global-status-bar">
      <Space size="middle" wrap>
        <Typography.Text type="secondary">当前页面：{pageLabel}</Typography.Text>
        <StatusTag label="阶段四" tone="processing" />
        <StatusTag label="静态工作台已接入" tone="success" />
      </Space>
    </Layout.Footer>
  )
}
