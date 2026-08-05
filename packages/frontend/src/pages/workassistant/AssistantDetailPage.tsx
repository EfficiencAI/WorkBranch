import { useCallback, useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Empty,
  List,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
  Upload,
} from 'antd'
import { DeleteOutlined, LinkOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import type { Assistant, KnowledgeSource, ShareInfo } from '../../entities'
import {
  createShare,
  deleteSource,
  fetchAssistant,
  fetchShares,
  fetchSources,
  reindexSource,
  setShareEnabled,
  uploadSource,
} from '../../shared/api'

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
  const [shares, setShares] = useState<ShareInfo[]>([])
  const [loading, setLoading] = useState(true)

  const loadSources = useCallback(async () => {
    try {
      setSources(await fetchSources(id))
    } catch {
      // 详情页次要数据，失败静默
    }
  }, [id])

  const loadShares = useCallback(async () => {
    try {
      setShares(await fetchShares(id))
    } catch {
      // 静默
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const detail = await fetchAssistant(id)
        if (!cancelled) setAssistant(detail)
        await Promise.all([loadSources(), loadShares()])
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
  }, [id, loadSources, loadShares, message])

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

  const handleCreateShare = async () => {
    try {
      const share = await createShare(id, { mode: 'public' })
      setShares((prev) => [share, ...prev])
      message.success('分享链接已生成')
    } catch {
      message.error('创建分享失败')
    }
  }

  const handleToggleShare = async (share: ShareInfo, enabled: boolean) => {
    try {
      const updated = await setShareEnabled(id, share.id, enabled)
      setShares((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    } catch {
      message.error('操作失败')
    }
  }

  if (!assistant) {
    return <Card loading={loading} />
  }

  const baseUrl = `${window.location.origin}/s`

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
            children: (
              <Card>
                <Empty description="P1 实现：用户主动说明 / AI 主动提问（知识缺口优先，知识库扫描其次），沉淀立即生效">
                  <Typography.Text type="secondary">
                    请先在知识库上传资料；对话训练能力（纠正、沉淀、AI 主动提问）将在 P1 接入。
                  </Typography.Text>
                </Empty>
              </Card>
            ),
          },
          {
            key: 'rules',
            label: '规则',
            children: (
              <Card>
                <Empty description="P1 实现：语气/边界/固定话术（FAQ）/模型设置" />
              </Card>
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
            children: (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <Card size="small">
                  <Space>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => void handleCreateShare()}>
                      创建分享链接
                    </Button>
                    <Typography.Text type="secondary">P1 支持访问密码、过期时间、二维码与导出助手包</Typography.Text>
                  </Space>
                </Card>
                <List
                  dataSource={shares}
                  locale={{ emptyText: <Empty description="还没有分享入口" /> }}
                  renderItem={(share) => (
                    <List.Item
                      actions={[
                        <Switch
                          key="enabled"
                          checked={Boolean(share.enabled)}
                          onChange={(checked) => void handleToggleShare(share, checked)}
                        />,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            <LinkOutlined />
                            <Typography.Text copyable code>
                              {`${baseUrl}/${share.token}`}
                            </Typography.Text>
                          </Space>
                        }
                        description={share.mode === 'password' ? '密码访问' : '公开访问'}
                      />
                    </List.Item>
                  )}
                />
              </Space>
            ),
          },
        ]}
      />
    </div>
  )
}
