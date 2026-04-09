import { App, Button, Checkbox, Input, Space, Tooltip, Typography } from 'antd'
import { SendOutlined, StopOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useSettings } from '../../app/settings'

type MessageComposerProps = {
  selectedConversationId: string | null
  selectedConversationLabel: string | null
  focusedConversationId: string | null
  focusedConversationLabel: string | null
  sending: boolean
  allowCreateOnSend?: boolean
  onSend: (message: string, enableContext: boolean) => Promise<void>
  onStop?: () => Promise<void> | void
  onSwitchToSendTarget?: (conversationId: string) => void
}

export function MessageComposer({
  selectedConversationId,
  selectedConversationLabel,
  focusedConversationId,
  focusedConversationLabel,
  sending,
  allowCreateOnSend = false,
  onSend,
  onStop,
  onSwitchToSendTarget,
}: MessageComposerProps) {
  const { settings } = useSettings()
  const { message: messageApi } = App.useApp()
  const [message, setMessage] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [enableContext, setEnableContext] = useState(false)
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
    await onSend(nextMessage, enableContext)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return
    }

    const shouldSend = messageSendShortcutsReversed ? event.shiftKey : !event.shiftKey
    if (!shouldSend) {
      return
    }

    // 检查选中节点是否是聚焦节点
    if (focusedConversationId && selectedConversationId !== focusedConversationId) {
      event.preventDefault()
      void messageApi.warning('当前聚焦节点不是被选中的消息发送节点，快捷键已被禁用')
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
            <Checkbox
              checked={enableContext}
              onChange={(e) => setEnableContext(e.target.checked)}
            >
              上下文组织
            </Checkbox>
            <Button size="small" onClick={() => setCollapsed(true)}>
              折叠
            </Button>
            {sending ? (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => void onStop?.()}
              >
                停止
              </Button>
            ) : focusedConversationId && focusedConversationId !== selectedConversationId && onSwitchToSendTarget ? (
              <Tooltip
                title={
                  <Space direction="vertical" size={4}>
                    <Typography.Text>当前发送目标与聚焦节点不一致</Typography.Text>
                    <Typography.Text type="secondary">
                      发送目标: {selectedConversationLabel ?? selectedConversationId}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      聚焦节点: {focusedConversationLabel ?? focusedConversationId}
                    </Typography.Text>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => onSwitchToSendTarget(focusedConversationId)}
                    >
                      切换到聚焦节点
                    </Button>
                  </Space>
                }
              >
                <span>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    disabled={!message.trim() || (!selectedConversationId && !allowCreateOnSend)}
                    onClick={() => void handleSend()}
                  >
                    发送
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                type="primary"
                icon={<SendOutlined />}
                disabled={!message.trim() || (!selectedConversationId && !allowCreateOnSend)}
                onClick={() => void handleSend()}
              >
                发送
              </Button>
            )}
          </Space>
        </div>
      </Space>
    </div>
  )
}
