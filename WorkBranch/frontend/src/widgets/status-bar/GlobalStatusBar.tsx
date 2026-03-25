import { Layout, Space, Typography } from 'antd'
import { useLocation } from 'react-router-dom'
import { StatusTag } from '../../shared/ui'

const pageLabelMap: Record<string, string> = {
  '/workspace': '工作台',
  '/settings': '设置',
}

export function GlobalStatusBar() {
  const location = useLocation()
  const pageLabel = pageLabelMap[location.pathname] ?? '工作台'

  return (
    <Layout.Footer className="global-status-bar">
      <Space size="middle" wrap>
        <Typography.Text type="secondary">当前页面：{pageLabel}</Typography.Text>
        <StatusTag label="阶段二" tone="processing" />
        <StatusTag label="基础框架已接入" tone="success" />
      </Space>
    </Layout.Footer>
  )
}
