import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  App,
  Button,
  Card,
  Empty,
  List,
  Space,
  Tabs,
  Tag,
  Typography,
  Upload,
} from 'antd'
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import type { Assistant, KnowledgeSource } from '../../entities'
import {
  deleteSource,
  fetchAssistant,
  fetchSources,
  reindexSource,
  uploadSource,
} from '../../shared/api'
import { RulesTab } from './components/RulesTab'
import { SharesTab } from './components/SharesTab'
import { StatsTab } from './components/StatsTab'
import { TrainTab } from './components/TrainTab'

const SOURCE_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'default' },
  processing: { label: '索引中', color: 'processing' },
  indexed: { label: '已索引', color: 'success' },
  failed: { label: '失败', color: 'error' },
}

export function AssistantDetailPage() {
  const { assistantId } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const id = Number(assistantId)

  const [assistant, setAssistant] = useState<Assistant | null>(null)
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(true)

  const quickQuestions = useMemo(() => {
    if (!assistant?.quick_questions) return []
    try {
      const parsed = JSON.parse(assistant.quick_questions)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }, [assistant?.quick_questions])

  const loadSources = useCallback(async () => {
    try {
      setSources(await fetchSources(id))
    } catch {
      // 详情页次要数据，失败静默
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const detail = await fetchAssistant(id)
        if (!cancelled) setAssistant(detail)
        await loadSources()
      } catch {
        if (!cancelled) message.error('助手加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, loadSources, message])

  const handleUpload = async (file: File) => {
    try {
      const source = await uploadSource(id, file)
      setSources((prev) => [source, ...prev])
      message.success(`已上传「${source.title}」，等待索引`)
      return true
    } catch {
      message.error('上传失败')
      return false
    }
  }

  const handleDeleteSource = async (sourceId: number) => {
    try {
      await deleteSource(id, sourceId)
      setSources((prev) => prev.filter((s) => s.id !== sourceId))
      message.success('已删除知识源')
    } catch {
      message.error('删除失败')
    }
  }

  const handleReindexSource = async (sourceId: number) => {
    try {
      const updated = await reindexSource(id, sourceId)
      setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
      message.success('已加入重新索引队列')
    } catch {
      message.error('重新索引失败')
    }
  }

  if (!assistant) {
    return <Card loading={loading} />
  }

  return (
    <div className="wa-page">
      <div className="wa-page-head">
        <Space align="center" size={12}>
          <span className="wa-avatar wa-avatar--lg">{assistant.avatar ?? '🤖'}</span>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {assistant.name}
            </Typography.Title>
            <Typography.Text type="secondary">{assistant.description || '暂无简介'}</Typography.Text>
          </div>
        </Space>
        <Button onClick={() => navigate('/assistant')}>返回列表</Button>
      </div>

      <Tabs
        defaultActiveKey="knowledge"
        items={[
          {
            key: 'knowledge',
            label: '知识库',
            children: (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <Upload.Dragger
                  multiple
                  showUploadList={false}
                  beforeUpload={(file) => {
                    void handleUpload(file)
                    return false
                  }}
                >
                  <p className="ant-upload-drag-icon">
                    <UploadOutlined />
                  </p>
                  <p className="ant-upload-text">拖拽文件到这里，或点击上传</p>
                  <p className="ant-upload-hint">支持 txt / md / pdf / docx / 常见代码文件</p>
                </Upload.Dragger>
                <Card size="small" title={`知识源（${sources.length}）`}>
                  <List
                    dataSource={sources}
                    locale={{ emptyText: <Empty description="还没有知识源" /> }}
                    renderItem={(source) => (
                      <List.Item
                        actions={[
                          <Button
                            key="reindex"
                            type="text"
                            onClick={() => void handleReindexSource(source.id)}
                            disabled={source.status === 'processing'}
                          >
                            重新索引
                          </Button>,
                          <Button
                            key="del"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => void handleDeleteSource(source.id)}
                          />,
                        ]}
                      >
                        <List.Item.Meta
                          title={source.title}
                          description={`${(source.size ?? 0) / 1024 > 1 ? `${(source.size! / 1024).toFixed(1)} KB` : `${source.size ?? 0} B`} · v${source.version}`}
                        />
                        <Tag color={SOURCE_STATUS[source.status]?.color ?? 'default'}>
                          {SOURCE_STATUS[source.status]?.label ?? source.status}
                        </Tag>
                      </List.Item>
                    )}
                  />
                </Card>
              </Space>
            ),
          },
          {
            key: 'train',
            label: '对话训练',
            children: <TrainTab assistantId={id} quickQuestions={quickQuestions} />,
          },
          {
            key: 'rules',
            label: '规则',
            children: (
              <RulesTab
                assistantId={id}
                assistant={assistant}
                onAssistantSaved={(updated) => setAssistant(updated)}
              />
            ),
          },
          {
            key: 'preview',
            label: '预览对话',
            children: (
              <Card>
                <Empty description="P1 实现：与访客同链路的 RAG 问答预览（带引用来源）" />
              </Card>
            ),
          },
          {
            key: 'shares',
            label: '分享',
            children: <SharesTab assistantId={id} />,
          },
          {
            key: 'stats',
            label: '统计',
            children: <StatsTab assistantId={id} />,
          },
        ]}
      />
    </div>
  )
}
