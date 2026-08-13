import { Button, Checkbox, Input, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd'
import { LoadingOutlined, PaperClipOutlined, SendOutlined, StopOutlined, SwapOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { useSettings } from '../../app/settings'
import { selectChatWorkbenchWorkspaceDetail, useChatWorkbenchStore } from '../../features/chat-workbench'
import { uploadWorkspaceFiles } from '../../shared/api/workspace'
import { useResponsive } from '../../shared/lib'
import type { AgentId } from '../../shared/api'

function isAndroidPlatform(): boolean {
  if (typeof window === 'undefined') return false
  const capacitor = (window as unknown as { Capacitor?: { getPlatform?: () => string; platform?: string } }).Capacitor
  return (capacitor?.getPlatform?.() ?? capacitor?.platform) === 'android'
}

type MessageComposerProps = {
  selectedConversationId: string | null
  selectedConversationLabel: string | null
  sending: boolean
  selectedAgentId: AgentId
  allowCreateOnSend?: boolean
  variant?: 'default' | 'empty'
  autoFocus?: boolean
  onSend: (message: string, enableContext: boolean) => Promise<boolean>
  onAgentChange: (agentId: AgentId) => void
  onStop?: () => Promise<void> | void
}

// 输入草稿缓存：键盘收起/切换节点导致组件卸载时保留未发送内容（含中文输入法组字）
const composerDraftCache = new Map<string, string>()

function saveComposerDraft(conversationId: string | null, value: string) {
  if (conversationId) {
    composerDraftCache.set(conversationId, value)
  }
}

export function MessageComposer({
  selectedConversationId,
  selectedConversationLabel,
  sending,
  selectedAgentId,
  allowCreateOnSend = false,
  variant = 'default',
  autoFocus = false,
  onSend,
  onAgentChange,
  onStop,
}: MessageComposerProps) {
  const { settings } = useSettings()
  const responsive = useResponsive()
  const [message, setMessage] = useState<string>(() => (selectedConversationId ? composerDraftCache.get(selectedConversationId) ?? '' : ''))
  const [collapsed, setCollapsed] = useState(false)
  const includeParentContextByDefault =
    settings?.context && typeof settings.context === 'object' && 'include_parent_context_by_default' in settings.context
      ? settings.context.include_parent_context_by_default === true
      : true
  const [enableContext, setEnableContext] = useState(includeParentContextByDefault)
  const [attachments, setAttachments] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [attachError, setAttachError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textAreaRef = useRef<TextAreaRef>(null)
  const workspaceId = useChatWorkbenchStore(selectChatWorkbenchWorkspaceDetail)?.id ?? null
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
  useEffect(() => {
    if (!autoFocus) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      textAreaRef.current?.focus({ cursor: 'end', preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [autoFocus])
  const updateMessage = useCallback((value: string) => {
    setMessage(value)
    saveComposerDraft(selectedConversationId, value)
  }, [selectedConversationId])

  async function handleSend() {
    const nextMessage = message.trim()
    if (!nextMessage || sending || (!selectedConversationId && !allowCreateOnSend)) {
      return
    }

    const messageWithAttachments = attachments.length > 0
      ? `${nextMessage}\n\n（已上传附件：${attachments.join('、')}，可在工作区查看）`
      : nextMessage
    const sent = await onSend(messageWithAttachments, enableContext)
    if (sent) {
      setMessage('')
      saveComposerDraft(selectedConversationId, '')
      setAttachments([])
      setAttachError(null)
    }
  }

  async function handleAttachFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length || !workspaceId) return
    setUploading(true)
    setAttachError(null)
    try {
      const saved = await uploadWorkspaceFiles(workspaceId, files)
      setAttachments((prev) => [...prev, ...saved.map((f) => f.original_filename)])
    } catch (err) {
      setAttachError(String((err as Error)?.message ?? err))
    } finally {
      setUploading(false)
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
      options={
        isAndroidPlatform()
          ? [{ value: 'builtin', label: 'Default' }]
          : [
              { value: 'builtin', label: 'Default' },
              { value: 'trae', label: 'Trae CLI' },
            ]
      }
    />
  )


  if (!hasSendTarget && variant === 'empty') {
    return (
      <div className="message-composer message-composer--empty">
        <Input.TextArea
          ref={textAreaRef}
          rows={2}
          value={message}
          onChange={(event) => updateMessage(event.target.value)}
          onCompositionEnd={(event) => updateMessage(event.currentTarget.value)}
          onBlur={(event) => { if (event.currentTarget.value) updateMessage(event.currentTarget.value) }}
          onKeyDown={handleKeyDown}
          placeholder="给 WorkBranch 发消息"
          autoSize={{ minRows: 2, maxRows: 5 }}
        />
        <div className="message-composer__empty-toolbar">
          <div className="message-composer__toolbar-left">
            <Tooltip title="首条消息发送后即可添加附件">
              <Button
                type="text"
                className="message-composer__tool-btn message-composer__tool-btn--icon"
                aria-label="添加附件"
                icon={<PaperClipOutlined />}
                disabled
              />
            </Tooltip>
          </div>
          <div className="message-composer__toolbar-right">
            <Space size={5} align="center" wrap={false}>
              {agentSelect}
              <Tooltip title="发送">
                <Button
                  type="primary"
                  className="message-composer__send-btn"
                  aria-label="发送"
                  icon={<SendOutlined />}
                  disabled={!message.trim() || !allowCreateOnSend}
                  onClick={() => void handleSend()}
                />
              </Tooltip>
            </Space>
          </div>
        </div>
      </div>
    )
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
          rows={2}
          value={message}
          onChange={(event) => updateMessage(event.target.value)}
          onCompositionEnd={(event) => { const v = event.currentTarget.value; updateMessage(v); }}
          onBlur={(event) => { const v = event.currentTarget.value; if (v) { updateMessage(v); } }}
          onKeyDown={handleKeyDown}
          placeholder={selectedConversationId || allowCreateOnSend ? '继续询问当前节点...' : ''}
          autoSize={{ minRows: 2, maxRows: 5 }}
        />

        {attachments.length > 0 || uploading || attachError ? (
          <div className="message-composer__attachments" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
            {attachments.map((name) => (
              <Tag key={name} closable onClose={() => setAttachments((prev) => prev.filter((n) => n !== name))}>{name}</Tag>
            ))}
            {uploading ? <Tag icon={<LoadingOutlined spin />}>上传中…</Tag> : null}
            {attachError ? <Tag color="error">上传失败：{attachError}</Tag> : null}
          </div>
        ) : null}
        <div className="message-composer__focused-toolbar">
          <div className="message-composer__toolbar-left">
            <Space size={6} align="center" wrap={false}>
              <Tooltip title={workspaceId ? "添加附件" : "暂无工作区，无法上传附件"}>
                <Button
                  type="text"
                  className="message-composer__tool-btn message-composer__tool-btn--icon"
                  aria-label="添加附件"
                  icon={<PaperClipOutlined />}
                  disabled={!workspaceId || uploading}
                  onClick={() => fileInputRef.current?.click()}
                />
              </Tooltip>
              <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => void handleAttachFiles(e)} />

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
          onChange={(event) => updateMessage(event.target.value)}
          onCompositionEnd={(event) => { const v = event.currentTarget.value; updateMessage(v); }}
          onBlur={(event) => { const v = event.currentTarget.value; if (v) { updateMessage(v); } }}
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
