import { useEffect, useRef, useState } from 'react'
import { App, Button, Card, Empty, Tag, Typography } from 'antd'
import { ImportOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { Assistant } from '../../entities'
import { selectAuthUser, useAuthStore } from '../../features/auth'
import { fetchAssistants, importAssistant, type ExportAssistantPackage } from '../../shared/api'

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  disabled: '已停用',
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const short = date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `更新于 ${short}`
}

export function WorkAssistantHomePage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const user = useAuthStore(selectAuthUser)
  const loadSession = useAuthStore((state) => state.loadSession)
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [loading, setLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text()
      const pkg = JSON.parse(text) as ExportAssistantPackage
      const assistant = await importAssistant(pkg)
      message.success(`已导入「${assistant.name}」，知识正在重新索引`)
      setAssistants((prev) => [assistant, ...prev])
    } catch {
      message.error('导入失败：请选择有效的 .wa.json 文件')
    }
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const authed = user ? true : await loadSession()
      if (!authed || cancelled) return
      setLoading(true)
      try {
        const list = await fetchAssistants()
        if (!cancelled) setAssistants(list)
      } catch (caughtError) {
        message.error('助手列表加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user, loadSession, message])

  if (!user) {
    return (
      <Card>
        <Empty description="登录后即可创建和管理你的 AI 助手">
          <Button type="primary" onClick={() => navigate('/auth')}>
            去登录
          </Button>
        </Empty>
      </Card>
    )
  }

  return (
    <div className="wa-page">
      <div className="wa-page-head">
        <div className="wa-page-head__copy">
          <span className="wa-page-head__eyebrow">工作区 · 助手中心</span>
          <Typography.Title level={4} className="wa-page-head__title">
            我的助手
          </Typography.Title>
          <Typography.Text type="secondary" className="wa-page-head__desc">
            把知识沉淀成可并发接待的 AI 分身
          </Typography.Text>
        </div>
        <div className="wa-page-head__actions">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.wa.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImportFile(file)
              e.target.value = ''
            }}
          />
          <Button icon={<ImportOutlined />} onClick={() => fileRef.current?.click()}>
            导入助手包
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/assistant/new')}>
            新建助手
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="wa-card-grid">
          <Card loading className="wa-assistant-card" />
        </div>
      ) : null}

      {!loading && assistants.length === 0 ? (
        <div className="wa-empty">
          <Empty description="还没有助手，点击右上角创建一个" />
        </div>
      ) : null}

      {!loading && assistants.length > 0 ? (
        <div className="wa-card-grid">
          {assistants.map((assistant) => (
            <Card
              key={assistant.id}
              hoverable
              className="wa-assistant-card"
              onClick={() => navigate(`/assistant/${assistant.id}`)}
            >
              <div className="wa-assistant-card__top">
                <span className="wa-avatar">{assistant.avatar ?? '🤖'}</span>
                <Tag className={`wa-status wa-status--${assistant.status}`}>
                  {STATUS_LABEL[assistant.status] ?? assistant.status}
                </Tag>
              </div>
              <Typography.Text strong className="wa-assistant-card__name">
                {assistant.name}
              </Typography.Text>
              <Typography.Paragraph type="secondary" className="wa-assistant-card__desc" ellipsis={{ rows: 2 }}>
                {assistant.description || '暂无简介'}
              </Typography.Paragraph>
              <div className="wa-assistant-card__meta">
                <span>{formatUpdatedAt(assistant.updated_at)}</span>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
