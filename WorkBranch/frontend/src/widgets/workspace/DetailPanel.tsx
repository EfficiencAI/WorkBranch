import { Button, Card, Descriptions, Space, Typography } from 'antd'
import { getStatusLabel, toStatusTone, type AsyncStatus } from '../../shared/lib/status'
import { StatusTag } from '../../shared/ui'
import { currentSessionDetail, getSelectedNode } from './workspaceMocks'

const systemStatus: Array<{ label: string; status: AsyncStatus; value: string }> = [
  {
    label: '工作台结构',
    status: 'success',
    value: '全屏画布与浮层交互已切换完成',
  },
  {
    label: '状态管理',
    status: 'loading',
    value: '等待下一阶段接入 Zustand',
  },
  {
    label: '接口联动',
    status: 'idle',
    value: '未接真实 API / SSE',
  },
]

type DetailPanelProps = {
  nodeId: string
  onClose: () => void
}

export function DetailPanel({ nodeId, onClose }: DetailPanelProps) {
  const selectedNode = getSelectedNode(nodeId)

  return (
    <section className="detail-panel" aria-label="图内节点聚焦详情">
      <Card className="detail-panel__card" bordered={false}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
            <Space direction="vertical" size={6}>
              <Typography.Text strong>节点聚焦查看</Typography.Text>
              <Typography.Title level={3} className="detail-panel__title">
                {selectedNode.title}
              </Typography.Title>
              <Space wrap>
                <StatusTag label={selectedNode.statusLabel} tone={selectedNode.tone} />
                <StatusTag label={`角色 ${selectedNode.role}`} tone="default" />
              </Space>
            </Space>
            <Space>
              <Button onClick={onClose}>返回会话图</Button>
            </Space>
          </Space>

          <Typography.Paragraph className="detail-panel__summary">{selectedNode.summary}</Typography.Paragraph>

          <Card size="small" className="detail-panel__note">
            <Typography.Text type="secondary">{selectedNode.content}</Typography.Text>
          </Card>

          <div className="detail-panel__grid">
            <Card size="small" className="detail-panel__section">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Typography.Text strong>节点信息</Typography.Text>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="节点 ID">{selectedNode.id}</Descriptions.Item>
                  <Descriptions.Item label="角色">{selectedNode.role}</Descriptions.Item>
                  <Descriptions.Item label="父节点">{selectedNode.parentId ?? '根节点'}</Descriptions.Item>
                  <Descriptions.Item label="创建时间">{selectedNode.createdAt}</Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>

            <Card size="small" className="detail-panel__section">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Typography.Text strong>会话信息</Typography.Text>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="会话标题">{currentSessionDetail.title}</Descriptions.Item>
                  <Descriptions.Item label="workspace_id">{currentSessionDetail.workspaceId}</Descriptions.Item>
                  <Descriptions.Item label="节点数量">{currentSessionDetail.nodeCount}</Descriptions.Item>
                  <Descriptions.Item label="分支数量">{currentSessionDetail.branchCount}</Descriptions.Item>
                  <Descriptions.Item label="更新时间">{currentSessionDetail.updatedAt}</Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>
          </div>

          <Card size="small" className="detail-panel__section">
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Typography.Text strong>系统状态</Typography.Text>
              {systemStatus.map((item) => (
                <Card key={item.label} size="small">
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Typography.Text strong>{item.label}</Typography.Text>
                      <StatusTag
                        label={getStatusLabel(item.status, {
                          idle: '未开始',
                          loading: '待接入',
                          success: '已完成',
                          error: '异常',
                        })}
                        tone={toStatusTone(item.status)}
                      />
                    </Space>
                    <Typography.Text type="secondary">{item.value}</Typography.Text>
                  </Space>
                </Card>
              ))}
            </Space>
          </Card>
        </Space>
      </Card>
    </section>
  )
}
