import { Button, Input, Space, Typography } from 'antd'
import { useState } from 'react'

type MessageComposerProps = {
  workspaceId: string | null
  sending: boolean
  onSend: (message: string) => Promise<void>
}

export function MessageComposer({ workspaceId, sending, onSend }: MessageComposerProps) {
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
          <Typography.Text strong>conversation workspace</Typography.Text>
          <Input value={workspaceId ?? ''} readOnly />
        </Space>

        <Space className="message-composer__footer" wrap>
          <Typography.Text type="secondary">发送将走 session 接口，详情/内容回读由 conversation 接口获取。</Typography.Text>
          <Space>
            <Button disabled={sending}>停止</Button>
            <Button
              type="primary"
              loading={sending}
              disabled={!message.trim() || sending}
              onClick={() => onSend(message)}
            >
              发送
            </Button>
          </Space>
        </Space>
      </Space>
    </div>
  )
}
