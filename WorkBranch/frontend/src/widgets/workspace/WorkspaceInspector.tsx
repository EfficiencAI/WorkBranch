import { Card, Descriptions, Space, Typography } from 'antd'
import { StatusTag } from '../../shared/ui'

export function WorkspaceInspector() {
  return (
    <Card className="workspace-column workspace-column--inspector" title="详情面板">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <StatusTag label="未选择节点" />
        <Typography.Paragraph type="secondary">
          右侧面板先保留结构位，后续阶段在这里展示节点详情、会话详情和运行状态。
        </Typography.Paragraph>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="当前阶段">第二阶段</Descriptions.Item>
          <Descriptions.Item label="页面状态">静态骨架</Descriptions.Item>
          <Descriptions.Item label="后端联动">未接入</Descriptions.Item>
        </Descriptions>
      </Space>
    </Card>
  )
}
