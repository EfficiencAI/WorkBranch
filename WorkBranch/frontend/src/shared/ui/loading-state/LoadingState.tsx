import { Flex, Spin, Typography } from 'antd'

type LoadingStateProps = {
  tip?: string
}

export function LoadingState({ tip = '加载中...' }: LoadingStateProps) {
  return (
    <Flex vertical align="center" justify="center" gap={12} className="loading-state">
      <Spin size="large" />
      <Typography.Text type="secondary">{tip}</Typography.Text>
    </Flex>
  )
}
