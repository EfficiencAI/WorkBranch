import { useEffect, useRef, useState } from 'react'
import { App, Avatar, Button, Card, Input, Spin, Typography } from 'antd'
import { SendOutlined } from '@ant-design/icons'
import { useParams } from 'react-router-dom'
import { createVisitorConversation, fetchShareMeta, streamVisitorAnswer, type ShareMeta } from '../../shared/api'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

const QUICK_QUESTIONS = ['支持哪些部署方式？', '报价是怎么计算的？', '有 API 文档吗？']

export function VisitorChatPage() {
  const { shareToken } = useParams()
  const { message: messageApi } = App.useApp()
  const [meta, setMeta] = useState<ShareMeta | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!shareToken) return
      try {
        const data = await fetchShareMeta(shareToken)
        if (!cancelled) setMeta(data)
      } catch {
        if (!cancelled) messageApi.error('分享不存在或已停用')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [shareToken, messageApi])

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [messages, sending])

  const handleStart = async () => {
    if (!shareToken) return
    setStarting(true)
    setPasswordError(false)
    try {
      const session = await createVisitorConversation(shareToken, meta?.requires_password ? password : undefined)
      setSessionId(session.session_id)
    } catch {
      setPasswordError(true)
      messageApi.error('访问密码错误或会话创建失败')
    } finally {
      setStarting(false)
    }
  }

  const send = async (text?: string) => {
    const question = (text ?? input).trim()
    if (!question || !shareToken || sessionId === null || sending) return
    setInput('')
    setSending(true)
    setMessages((prev) => [...prev, { role: 'user', content: question }])

    let answer = ''
    let finished = false
    try {
      await streamVisitorAnswer(shareToken, sessionId, question, {
        onDelta: (delta) => {
          answer += delta
          setMessages((prev) => {
            const next = [...prev]
            if (next[next.length - 1]?.role === 'assistant') {
              next[next.length - 1] = { ...next[next.length - 1], content: answer }
            } else {
              next.push({ role: 'assistant', content: answer })
            }
            return next
          })
        },
        onDone: (content, sources) => {
          finished = true
          setMessages((prev) => {
            const next = [...prev]
            if (next[next.length - 1]?.role === 'assistant') {
              next[next.length - 1] = { ...next[next.length - 1], content, sources }
            } else {
              next.push({ role: 'assistant', content, sources })
            }
            return next
          })
        },
        onError: (errorMessage) => {
          finished = true
          setMessages((prev) => [...prev, { role: 'assistant', content: `出错了：${errorMessage}` }])
        },
      })
      if (!finished) {
        setMessages((prev) => [...prev, { role: 'assistant', content: answer || '（无响应）' }])
      }
    } catch {
      if (!finished) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '请求失败，请稍后再试' }])
      }
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="visitor-page">
        <Spin />
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="visitor-page">
        <Card className="visitor-card">
          <Typography.Title level={4}>分享不存在或已停用</Typography.Title>
          <Typography.Text type="secondary">请联系分享者确认链接是否有效。</Typography.Text>
        </Card>
      </div>
    )
  }

  return (
    <div className="visitor-page">
      <Card className="visitor-card visitor-chat-card">
        <div className="visitor-chat-header">
          <Avatar className="visitor-avatar" size={44}>
            {meta.assistant.avatar ?? '🤖'}
          </Avatar>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {meta.assistant.name}
            </Typography.Title>
            <Typography.Text type="secondary">AI 助手 · 在线 · 免登录</Typography.Text>
          </div>
        </div>

        {meta.assistant.description ? (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 10 }}>
            {meta.assistant.description}
          </Typography.Paragraph>
        ) : null}

        {!sessionId ? (
          <>
            <div className="visitor-welcome">
              {meta.assistant.welcome_message || `你好，我是「${meta.assistant.name}」。有什么可以帮你？`}
            </div>
            {meta.requires_password ? (
              <Input.Password
                status={passwordError ? 'error' : undefined}
                placeholder="请输入访问密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onPressEnter={() => void handleStart()}
                style={{ marginTop: 12 }}
              />
            ) : null}
            <Button type="primary" block loading={starting} onClick={() => void handleStart()} style={{ marginTop: 12 }}>
              开始对话
            </Button>
          </>
        ) : (
          <>
            <div className="visitor-chat-body" ref={bodyRef}>
              {messages.length === 0 ? (
                <div className="visitor-welcome">
                  {meta.assistant.welcome_message || `你好，我是「${meta.assistant.name}」。有什么可以帮你？`}
                </div>
              ) : null}
              {messages.map((msg, index) => (
                <div key={index} className={`visitor-msg visitor-msg--${msg.role}`}>
                  <div className="visitor-msg-bubble">
                    <span className="visitor-msg-text">{msg.content}</span>
                    {msg.sources && msg.sources.length > 0 ? (
                      <span className="visitor-msg-sources">
                        📎 引用：{msg.sources.join('、')}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
              {sending ? (
                <div className="visitor-msg visitor-msg--assistant">
                  <div className="visitor-msg-bubble">
                    <span className="visitor-msg-text">…</span>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="visitor-quick">
              {QUICK_QUESTIONS.map((q) => (
                <button key={q} type="button" className="visitor-chip" disabled={sending} onClick={() => void send(q)}>
                  {q}
                </button>
              ))}
            </div>
            <div className="visitor-input-row">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPressEnter={() => void send()}
                placeholder="输入你的问题…"
                disabled={sending}
              />
              <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => void send()}>
                发送
              </Button>
            </div>
          </>
        )}

        <Typography.Text type="secondary" className="auth-local-note" style={{ marginTop: 14 }}>
          AI 助手 · 内容仅供内部参考
        </Typography.Text>
      </Card>
    </div>
  )
}
