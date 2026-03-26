import { Button, Input, Space, Typography } from 'antd'
import { useState } from 'react'
import { currentWorkspaceId } from './workspaceMocks'

export function MessageComposer() {
  const [workspaceId, setWorkspaceId] = useState(currentWorkspaceId)
  const [message, setMessage] = useState('请基于当前节点继续展开下一轮对话。')

  return (
    <div className="message-composer">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Input.TextArea
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="输入下一步指令..."
        />

        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Typography.Text strong>workspace_id</Typography.Text>
          <Input value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
        </Space>

        <Space className="message-composer__footer" wrap>
          <Typography.Text type="secondary">静态阶段仅展示图内新建节点的输入形态。</Typography.Text>
          <Space>
            <Button>停止</Button>
            <Button type="primary">发送</Button>
          </Space>
        </Space>
      </Space>
    </div>
  )
}
