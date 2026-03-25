import { Card, Descriptions, Space, Tabs, Typography } from 'antd'
import { getStatusLabel, toStatusTone, type AsyncStatus } from '../../shared/lib/status'
import { StatusTag } from '../../shared/ui'
import { currentSessionDetail, selectedNode } from './workspaceMocks'

const systemStatus: Array<{ label: string; status: AsyncStatus; value: string }> = [
  {
    label: '页面结构',
    status: 'success',
    value: '阶段四静态界面已就绪',
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

export function DetailPanel() {
  return (
    <Card className="workspace-column detail-panel" title="DetailPanel">
      <Tabs
        items={[
          {
            key: 'node',
            label: '节点详情',
            children: (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Space direction="vertical" size={4}>
                  <Typography.Text strong>{selectedNode.title}</Typography.Text>
                  <StatusTag label={selectedNode.statusLabel} tone={selectedNode.tone} />
                </Space>

                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="节点 ID">{selectedNode.id}</Descriptions.Item>
                  <Descriptions.Item label="角色">{selectedNode.role}</Descriptions.Item>
                  <Descriptions.Item label="父节点">{selectedNode.parentId ?? '根节点'}</Descriptions.Item>
                  <Descriptions.Item label="摘要">{selectedNode.summary}</Descriptions.Item>
                </Descriptions>

                <Card size="small" className="detail-panel__note">
                  <Typography.Text type="secondary">{selectedNode.content}</Typography.Text>
                </Card>
              </Space>
            ),
          },
          {
            key: 'session',
            label: '会话详情',
            children: (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="会话标题">{currentSessionDetail.title}</Descriptions.Item>
                <Descriptions.Item label="workspace_id">{currentSessionDetail.workspaceId}</Descriptions.Item>
                <Descriptions.Item label="节点数量">{currentSessionDetail.nodeCount}</Descriptions.Item>
                <Descriptions.Item label="分支数量">{currentSessionDetail.branchCount}</Descriptions.Item>
                <Descriptions.Item label="更新时间">{currentSessionDetail.updatedAt}</Descriptions.Item>
              </Descriptions>
            ),
          },
          {
            key: 'system',
            label: '系统状态',
            children: (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
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
            ),
          },
        ]}
      />
    </Card>
  )
}
