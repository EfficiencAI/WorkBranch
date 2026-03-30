import { Button, Input, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'

type MessageComposerProps = {
  workspaceId: string | null
  selectedConversationId: string | null
  selectedConversationLabel: string | null
  sending: boolean
  onSend: (message: string) => Promise<void>
}

export function MessageComposer({ workspaceId, selectedConversationId, selectedConversationLabel, sending, onSend }: MessageComposerProps) {
  const [message, setMessage] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (selectedConversationId) {
      setCollapsed(false)
    }
  }, [selectedConversationId])

  async function handleSend() {
    const nextMessage = message.trim()
    if (!nextMessage || sending) {
      return
    }

    await onSend(nextMessage)
    setMessage('')
  }

  if (collapsed) {
    return (
      <div className="message-composer message-composer--collapsed">
        <Space className="message-composer__collapsed-bar" align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text type="secondary">输入框已折叠</Typography.Text>
          <Button size="small" onClick={() => setCollapsed(false)}>
            展开
          </Button>
        </Space>
      </div>
    )
  }

  return (
    <div className="message-composer">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space direction="vertical" size={2}>
            <Typography.Text strong>当前目标对话</Typography.Text>
            <Typography.Text type={selectedConversationId ? undefined : 'secondary'}>
              {selectedConversationId ? `${selectedConversationLabel ?? selectedConversationId}` : '发送首条消息时将自动创建对话'}
            </Typography.Text>
          </Space>
          <Button size="small" onClick={() => setCollapsed(true)}>
            折叠
          </Button>
        </Space>

        <Input.TextArea
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={selectedConversationId ? '输入下一步指令...' : '输入首条消息后自动创建对话'}
        />

        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Typography.Text strong>conversation workspace</Typography.Text>
          <Input value={workspaceId ?? ''} readOnly />
        </Space>

        <Space className="message-composer__footer" wrap>
          <Typography.Text type="secondary">
            {selectedConversationId
              ? `消息将发送到当前选中的对话 ${selectedConversationLabel ?? selectedConversationId}。`
              : '当前未选中对话；发送时会先创建首个对话。'}
          </Typography.Text>
          <Space>
            <Button disabled={sending}>停止</Button>
            <Button type="primary" loading={sending} disabled={!message.trim() || sending} onClick={() => void handleSend()}>
              发送
            </Button>
          </Space>
        </Space>
      </Space>
    </div>
  )
}
