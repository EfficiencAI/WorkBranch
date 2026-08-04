import { useEffect, useState } from 'react'
import { App, Button, Card, Input, Space, Typography } from 'antd'
import { useParams } from 'react-router-dom'
import { createVisitorConversation, fetchShareMeta, type ShareMeta } from '../../shared/api'

export function VisitorChatPage() {
  const { shareToken } = useParams()
  const { message } = App.useApp()
  const [meta, setMeta] = useState<ShareMeta | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!shareToken) return
      try {
        const data = await fetchShareMeta(shareToken)
        if (!cancelled) setMeta(data)
      } catch {
        if (!cancelled) message.error('分享不存在或已停用')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [shareToken, message])

  const handleStart = async () => {
    if (!shareToken) return
    setStarting(true)
    try {
      const session = await createVisitorConversation(shareToken)
      setSessionId(session.session_id)
    } catch {
      message.error('会话创建失败')
    } finally {
      setStarting(false)
    }
  }

  if (loading) {
    return <Card loading className="visitor-page" />
  }

  if (!meta) {
    return (
      <div className="visitor-page">
        <Card>
          <Typography.Title level={4}>分享不存在或已停用</Typography.Title>
          <Typography.Text type="secondary">请联系分享者确认链接是否有效。</Typography.Text>
        </Card>
      </div>
    )
  }

  return (
    <div className="visitor-page">
      <Card className="visitor-card">
        <Space align="center" size={12} style={{ marginBottom: 14 }}>
          <span className="wa-avatar wa-avatar--lg">{meta.assistant.avatar ?? '🤖'}</span>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {meta.assistant.name}
            </Typography.Title>
            <Typography.Text type="secondary">
              AI 助手 · 在线 · 免登录
            </Typography.Text>
          </div>
        </Space>

        <div className="visitor-welcome">
          {meta.assistant.welcome_message || `你好，我是「${meta.assistant.name}」。有什么可以帮你？`}
        </div>

        {sessionId ? (
          <>
            <div className="visitor-conv">
              <Typography.Text type="secondary">会话已创建（#{sessionId}）</Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                RAG 问答将在 P1 接入：回复会标注引用来源，答不上来的问题会自动记录为知识缺口。
              </Typography.Paragraph>
            </div>
            <Input.TextArea
              rows={3}
              disabled
              placeholder="提问功能将在 P1 开放…"
              style={{ marginTop: 8 }}
            />
          </>
        ) : (
          <Button type="primary" block loading={starting} onClick={() => void handleStart()} style={{ marginTop: 12 }}>
            开始对话
          </Button>
        )}

        <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 16, fontSize: 12 }}>
          AI 助手 · 内容仅供内部参考
        </Typography.Text>
      </Card>
    </div>
  )
}
