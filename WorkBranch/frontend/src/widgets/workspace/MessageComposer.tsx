import { Button, Card, Input, Space, Typography } from 'antd'
import { useState } from 'react'
import { currentWorkspaceId } from './workspaceMocks'

export function MessageComposer() {
  const [workspaceId, setWorkspaceId] = useState(currentWorkspaceId)
  const [message, setMessage] = useState('请帮我把阶段四静态工作台补齐，但先不要接入真实数据。')

  return (
    <Card size="small" className="message-composer" title="MessageComposer">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Typography.Text strong>workspace_id</Typography.Text>
          <Input value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
        </Space>

        <Input.TextArea
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="输入你的下一步指令..."
        />

        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Typography.Text type="secondary">当前为静态 UI 预览，按钮仅展示交互位置。</Typography.Text>
          <Space>
            <Button>停止</Button>
            <Button type="primary">发送</Button>
          </Space>
        </Space>
      </Space>
    </Card>
  )
}
