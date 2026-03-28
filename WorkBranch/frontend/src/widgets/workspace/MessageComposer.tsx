import { Button, Input, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'

type MessageComposerProps = {
  workspaceId: string | null
  selectedNodeId: string | null
  selectedNodeLabel: string | null
  sending: boolean
  onSend: (message: string) => Promise<void>
}

export function MessageComposer({ workspaceId, selectedNodeId, selectedNodeLabel, sending, onSend }: MessageComposerProps) {
  const [message, setMessage] = useState('')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (selectedNodeId) {
      setCollapsed(false)
    }
  }, [selectedNodeId])

  async function handleSend() {
    const nextMessage = message.trim()
    if (!nextMessage || !selectedNodeId || sending) {
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
            <Typography.Text strong>当前构建目标</Typography.Text>
            <Typography.Text type={selectedNodeId ? undefined : 'secondary'}>
              {selectedNodeId ? `${selectedNodeLabel ?? selectedNodeId}` : '请先右键或单击选择一个节点'}
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
          placeholder={selectedNodeId ? '输入下一步指令...' : '请先选择构建目标节点'}
        />

        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Typography.Text strong>conversation workspace</Typography.Text>
          <Input value={workspaceId ?? ''} readOnly />
        </Space>

        <Space className="message-composer__footer" wrap>
          <Typography.Text type="secondary">
            {selectedNodeId
              ? `消息将以节点 ${selectedNodeLabel ?? selectedNodeId} 为当前构建目标。`
              : '发送前必须先选择构建目标节点。'}
          </Typography.Text>
          <Space>
            <Button disabled={sending}>停止</Button>
            <Button type="primary" loading={sending} disabled={!message.trim() || !selectedNodeId || sending} onClick={() => void handleSend()}>
              发送
            </Button>
          </Space>
        </Space>
      </Space>
    </div>
  )
}
