import { Button, Card, Descriptions, Space, Typography } from 'antd'
import type { ConversationDetail, MessageNode, SessionDetail, WorkspaceDetail } from '../../entities'
import { getStatusLabel, toStatusTone, type AsyncStatus } from '../../shared/lib/status'
import { StatusTag } from '../../shared/ui'

const systemStatus: Array<{ label: string; status: AsyncStatus; value: string }> = [
  {
    label: '图界面结构',
    status: 'success',
    value: '全屏画布与浮层交互已切换完成',
  },
  {
    label: '状态管理',
    status: 'success',
    value: '已接入 chat-workbench Zustand store',
  },
  {
    label: '接口联动',
    status: 'success',
    value: '已接入 session / conversation / workspace API',
  },
]

type DetailPanelProps = {
  nodeId: string
  nodes: MessageNode[]
  conversationDetail: ConversationDetail
  sessionDetail: SessionDetail
  workspaceDetail: WorkspaceDetail | null
  onClose: () => void
}

export function DetailPanel({ nodeId, nodes, conversationDetail, sessionDetail, workspaceDetail, onClose }: DetailPanelProps) {
  const selectedNode = nodes.find((node) => node.id === nodeId)

  if (!selectedNode) {
    return null
  }

  return (
    <section className="detail-panel" aria-label="图内节点聚焦详情">
      <Card className="detail-panel__card" bordered={false}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start" wrap>
            <Space direction="vertical" size={6}>
              <Typography.Text strong>节点聚焦查看</Typography.Text>
              <Typography.Title level={3} className="detail-panel__title">
                {selectedNode.id}
              </Typography.Title>
              <Space wrap>
                <StatusTag label={selectedNode.status ?? 'ready'} tone="default" />
                <StatusTag label={`角色 ${selectedNode.role}`} tone="default" />
              </Space>
            </Space>
            <Space>
              <Button onClick={onClose}>返回会话图</Button>
            </Space>
          </Space>

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
                  <Descriptions.Item label="创建时间">{selectedNode.createdAt ?? '未知'}</Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>

            <Card size="small" className="detail-panel__section">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Typography.Text strong>对话信息</Typography.Text>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="conversation_id">{conversationDetail.conversationId}</Descriptions.Item>
                  <Descriptions.Item label="workspace_id">{conversationDetail.workspaceId ?? 'N/A'}</Descriptions.Item>
                  <Descriptions.Item label="状态">{conversationDetail.state}</Descriptions.Item>
                  <Descriptions.Item label="消息数">{conversationDetail.messageCount}</Descriptions.Item>
                  <Descriptions.Item label="创建时间">{conversationDetail.createdAt}</Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>

            <Card size="small" className="detail-panel__section">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Typography.Text strong>所属会话</Typography.Text>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="session_id">{sessionDetail.id}</Descriptions.Item>
                  <Descriptions.Item label="会话标题">{sessionDetail.title}</Descriptions.Item>
                </Descriptions>
              </Space>
            </Card>

            <Card size="small" className="detail-panel__section">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Typography.Text strong>workspace 信息</Typography.Text>
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="路径">{workspaceDetail?.dir ?? '未解析'}</Descriptions.Item>
                  <Descriptions.Item label="状态">{workspaceDetail?.status ?? '未知'}</Descriptions.Item>
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
