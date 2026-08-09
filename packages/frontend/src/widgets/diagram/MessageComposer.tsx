import { Button, Checkbox, Input, Select, Space, Switch, Tooltip, Typography } from 'antd'
import { BulbOutlined, GlobalOutlined, PaperClipOutlined, SendOutlined, StopOutlined, SwapOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useSettings } from '../../app/settings'
import { useResponsive } from '../../shared/lib'
import type { AgentId } from '../../shared/api'

type MessageComposerProps = {
  selectedConversationId: string | null
  selectedConversationLabel: string | null
  sending: boolean
  selectedAgentId: AgentId
  allowCreateOnSend?: boolean
  onSend: (message: string, enableContext: boolean) => Promise<boolean>
  onAgentChange: (agentId: AgentId) => void
  onStop?: () => Promise<void> | void
}

export function MessageComposer({
  selectedConversationId,
  selectedConversationLabel,
  sending,
  selectedAgentId,
  allowCreateOnSend = false,
  onSend,
  onAgentChange,
  onStop,
}: MessageComposerProps) {
  const { settings } = useSettings()
  const responsive = useResponsive()
  const [message, setMessage] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [enableContext, setEnableContext] = useState(false)
  const [thinkMode, setThinkMode] = useState(false)
  const [netMode, setNetMode] = useState(false)
  const hasSendTarget = selectedConversationId !== null
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

    const sent = await onSend(nextMessage, enableContext)
    if (sent) {
      setMessage('')
    }
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

  const agentSelect = (
    <Select<AgentId>
      className="message-composer__agent-select"
      size="small"
      value={selectedAgentId}
      onChange={onAgentChange}
      style={{ minWidth: 112 }}
      suffixIcon={<SwapOutlined />}
      labelRender={() => (selectedAgentId === 'builtin' ? '内置 Agent' : 'Trae CLI')}
      options={[
        { value: 'builtin', label: 'Default' },
        { value: 'trae', label: 'Trae CLI' },
      ]}
    />
  )

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
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedConversationId || allowCreateOnSend ? '继续询问当前节点...' : ''}
          autoSize={{ minRows: 2, maxRows: 5 }}
        />

        <div className="message-composer__focused-toolbar">
          <div className="message-composer__toolbar-left">
            <Space size={6} align="center" wrap={false}>
              <Tooltip title="添加附件">
                <Button
                  type="text"
                  className="message-composer__tool-btn message-composer__tool-btn--icon"
                  aria-label="添加附件"
                  icon={<PaperClipOutlined />}
                />
              </Tooltip>

              <label className="message-composer__context-toggle">
                <Switch aria-label="携带路径上下文" size="small" checked={enableContext} onChange={setEnableContext} />
                <span>携带路径上下文</span>
              </label>

              <Typography.Text className="message-composer__focused-target">
                发送到：{selectedConversationLabel ?? selectedConversationId}
              </Typography.Text>
            </Space>
          </div>

          <div className="message-composer__toolbar-right">
            <Space size={5} align="center" wrap={false}>
              {agentSelect}
              <Tooltip title="深度思考">
                <Button
                  type="text"
                  className={`message-composer__tool-btn message-composer__tool-btn--icon ${thinkMode ? 'message-composer__tool-btn--active' : ''}`}
                  aria-label="深度思考"
                  aria-pressed={thinkMode}
                  icon={<BulbOutlined />}
                  onClick={() => setThinkMode(!thinkMode)}
                />
              </Tooltip>
              <Tooltip title="联网搜索">
                <Button
                  type="text"
                  className={`message-composer__tool-btn message-composer__tool-btn--icon ${netMode ? 'message-composer__tool-btn--active' : ''}`}
                  aria-label="联网搜索"
                  aria-pressed={netMode}
                  icon={<GlobalOutlined />}
                  onClick={() => setNetMode(!netMode)}
                />
              </Tooltip>
            {sending ? (
              <Tooltip title="停止生成">
                <Button
                  danger
                  className="message-composer__send-btn"
                  aria-label="停止生成"
                  icon={<StopOutlined />}
                  onClick={() => void onStop?.()}
                />
              </Tooltip>
            ) : (
              <Tooltip title="发送">
                <Button
                  type="primary"
                  className="message-composer__send-btn"
                  aria-label="发送"
                  icon={<SendOutlined />}
                  disabled={!message.trim() || (!selectedConversationId && !allowCreateOnSend)}
                  onClick={() => void handleSend()}
                />
              </Tooltip>
            )}
            </Space>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={responsive.isMobile ? 'message-composer message-composer--mobile' : 'message-composer'}>
      <Space orientation="vertical" size={10} style={{ width: '100%' }}>
        <Input.TextArea
          rows={responsive.composerConfig.textareaRows}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={selectedConversationId || allowCreateOnSend ? '输入下一步指令...' : ''}
        />

        <div className="message-composer__bottom-row">
          {responsive.isMobile ? (
            <Space orientation="vertical" size={8} style={{ width: '100%' }}>
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
                {agentSelect}
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
                {agentSelect}
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
