import { Button, Input, Space, Typography } from 'antd'
import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useSettings } from '../../app/settings'

type MessageComposerProps = {
  selectedConversationId: string | null
  selectedConversationLabel: string | null
  sending: boolean
  allowCreateOnSend?: boolean
  onSend: (message: string) => Promise<void>
  onStop?: () => Promise<void> | void
}

export function MessageComposer({
  selectedConversationId,
  selectedConversationLabel,
  sending,
  allowCreateOnSend = false,
  onSend,
  onStop,
}: MessageComposerProps) {
  const { settings } = useSettings()
  const [message, setMessage] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const messageSendShortcutsReversed =
    settings?.ui && typeof settings.ui === 'object' && 'message_send_shortcuts_reversed' in settings.ui
      ? settings.ui.message_send_shortcuts_reversed === true
      : false

  useEffect(() => {
    if (selectedConversationId) {
      setCollapsed(false)
    }
  }, [selectedConversationId])

  async function handleSend() {
    const nextMessage = message.trim()
    if (!nextMessage || sending || (!selectedConversationId && !allowCreateOnSend)) {
      return
    }

    setMessage('')
    await onSend(nextMessage)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return
    }

    const shouldSend = messageSendShortcutsReversed ? event.shiftKey : !event.shiftKey
    if (!shouldSend) {
      return
    }

    event.preventDefault()
    void handleSend()
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
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Input.TextArea
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedConversationId || allowCreateOnSend ? '输入下一步指令...' : ''}
        />

        <div className="message-composer__bottom-row">
          <Space className="message-composer__target" align="center" size={8}>
            <Typography.Text strong>当前目标对话</Typography.Text>
            {selectedConversationId ? <Typography.Text>{selectedConversationLabel ?? selectedConversationId}</Typography.Text> : null}
          </Space>

          <Space className="message-composer__footer" wrap>
            <Button size="small" onClick={() => setCollapsed(true)}>
              折叠
            </Button>
            <Button disabled={!sending} onClick={() => void onStop?.()}>
              停止
            </Button>
            <Button type="primary" loading={sending} disabled={!message.trim() || sending || (!selectedConversationId && !allowCreateOnSend)} onClick={() => void handleSend()}>
              发送
            </Button>
          </Space>
        </div>
      </Space>
    </div>
  )
}
