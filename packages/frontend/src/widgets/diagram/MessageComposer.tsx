import { Button, Checkbox, Input, Space, Typography } from 'antd'
import { BulbOutlined, GlobalOutlined, PlusOutlined, SendOutlined, StopOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { useSettings } from '../../app/settings'
import { useResponsive } from '../../shared/lib'

type MessageComposerProps = {
  selectedConversationId: string | null
  selectedConversationLabel: string | null
  sending: boolean
  allowCreateOnSend?: boolean
  onSend: (message: string, enableContext: boolean) => Promise<void>
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
  const responsive = useResponsive()
  const [message, setMessage] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [enableContext, setEnableContext] = useState(false)
  const [thinkMode, setThinkMode] = useState(false)
  const [netMode, setNetMode] = useState(false)
  const [btnStyle, setBtnStyle] = useState<CSSProperties>({})
  const hasSendTarget = selectedConversationId !== null
  const toolbarRef = useRef<HTMLDivElement>(null)
  const messageSendShortcutsReversed =
    settings?.ui && typeof settings.ui === 'object' && 'message_send_shortcuts_reversed' in settings.ui
      ? settings.ui.message_send_shortcuts_reversed === true
      : false

  const calcBtnSize = useCallback(() => {
    const el = toolbarRef.current
    if (!el || !hasSendTarget) return
    const containerWidth = el.clientWidth
    const btnCount = 6
    const gapCount = 5
    const baseGap = Math.max(4, containerWidth * 0.008)
    const totalGaps = baseGap * gapCount
    const availableWidth = containerWidth - totalGaps
    
    const height = Math.max(24, Math.min(30, containerWidth * 0.035))
    const aspectRatio = 2.5
    const minBtnWidth = height * aspectRatio
    const maxBtnWidth = 72
    const btnWidth = Math.min(maxBtnWidth, Math.max(minBtnWidth, availableWidth / btnCount))
    
    const fontSize = Math.max(10, Math.min(12, containerWidth * 0.014))
    setBtnStyle({
      width: `${btnWidth}px`,
      height: `${height}px`,
      fontSize: `${fontSize}px`,
    })
  }, [hasSendTarget])

  useEffect(() => {
    if (!hasSendTarget) return
    calcBtnSize()
    const observer = new ResizeObserver(calcBtnSize)
    if (toolbarRef.current) observer.observe(toolbarRef.current)
    return () => observer.disconnect()
  }, [hasSendTarget, calcBtnSize])

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

  if (hasSendTarget) {
    return (
      <div className="message-composer message-composer--focused">
        <Input.TextArea
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedConversationId || allowCreateOnSend ? '输入下一步指令...' : ''}
          autoSize={{ minRows: 3, maxRows: 8 }}
        />

        <div className="message-composer__focused-toolbar" ref={toolbarRef}>
          <div className="message-composer__toolbar-left">
            <Space size={8} align="center" wrap={false}>
              <Button
                type="text"
                shape="round"
                className="message-composer__tool-btn"
                style={btnStyle}
                icon={<PlusOutlined />}
              />

              <Button
                shape="round"
                className="message-composer__tool-btn"
                style={btnStyle}
              >
                模式
              </Button>

              <Button
                type="text"
                shape="round"
                className={`message-composer__tool-btn ${thinkMode ? 'message-composer__tool-btn--active' : ''}`}
                style={btnStyle}
                icon={<BulbOutlined />}
                onClick={() => setThinkMode(!thinkMode)}
              >
                思考
              </Button>

              <Button
                type="text"
                shape="round"
                className={`message-composer__tool-btn ${netMode ? 'message-composer__tool-btn--active' : ''}`}
                style={btnStyle}
                icon={<GlobalOutlined />}
                onClick={() => setNetMode(!netMode)}
              >
                联网
              </Button>
            </Space>
          </div>

          <div className="message-composer__toolbar-right">
            {sending ? (
              <Button
                danger
                shape="round"
                className="message-composer__send-btn"
                style={btnStyle}
                icon={<StopOutlined />}
                onClick={() => void onStop?.()}
              >
                停止
              </Button>
            ) : (
              <Button
                type="primary"
                shape="round"
                className="message-composer__send-btn"
                style={btnStyle}
                icon={<SendOutlined />}
                disabled={!message.trim() || (!selectedConversationId && !allowCreateOnSend)}
                onClick={() => void handleSend()}
              >
                发送
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={responsive.isMobile ? 'message-composer message-composer--mobile' : 'message-composer'}>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Input.TextArea
          rows={responsive.composerConfig.textareaRows}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedConversationId || allowCreateOnSend ? '输入下一步指令...' : ''}
        />

        <div className="message-composer__bottom-row">
          {responsive.isMobile ? (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
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
                <Button size={responsive.composerConfig.buttonSize} onClick={() => setCollapsed(true)}>
                  折叠
                </Button>
                {sending ? (
                  <Button
                    danger
                    size={responsive.composerConfig.buttonSize}
                    icon={<StopOutlined />}
                    onClick={() => void onStop?.()}
                  >
                    停止
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    size={responsive.composerConfig.buttonSize}
                    icon={<SendOutlined />}
                    disabled={!message.trim() || (!selectedConversationId && !allowCreateOnSend)}
                    onClick={() => void handleSend()}
                  >
                    发送
                  </Button>
                )}
              </Space>
            </Space>
          ) : (
            <>
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
            </>
          )}
        </div>
      </Space>
    </div>
  )
}
