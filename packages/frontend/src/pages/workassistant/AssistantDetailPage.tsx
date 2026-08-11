import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { App, Button, Card, Empty, Tabs, Tag, Tooltip, Tree, Typography, Upload } from 'antd'
import {
  DeleteOutlined,
  DownOutlined,
  FileOutlined,
  FileTextOutlined,
  FileZipOutlined,
  FolderOpenOutlined,
  RightOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import type { Assistant, KnowledgeSource } from '../../entities'
import {
  deleteSource,
  fetchAssistant,
  fetchSources,
  getErrorMessage,
  reindexSource,
  uploadDirectorySource,
  uploadSource,
} from '../../shared/api'
import { RulesTab } from './components/RulesTab'
import { SharesTab } from './components/SharesTab'
import { StatsTab } from './components/StatsTab'
import { TrainTab } from './components/TrainTab'

const SOURCE_STATUS: Record<string, { label: string }> = {
  pending: { label: '待处理' },
  processing: { label: '索引中' },
  indexed: { label: '已索引' },
  failed: { label: '失败' },
}

function formatSize(size: number | null): string {
  const value = size ?? 0
  return value / 1024 > 1 ? `${(value / 1024).toFixed(1)} KB` : `${value} B`
}

interface SourceTreeNode {
  title: ReactNode
  key: string
  icon: ReactNode
  children?: SourceTreeNode[]
}

interface MutableTreeNode {
  name: string
  path: string
  size?: number
  children: Map<string, MutableTreeNode>
}

function buildSourceTree(source: KnowledgeSource): SourceTreeNode[] {
  const root = new Map<string, MutableTreeNode>()
  source.entries.forEach((entry) => {
    let level = root
    let currentPath = ''
    entry.path.split('/').forEach((name, index, segments) => {
      currentPath = currentPath ? `${currentPath}/${name}` : name
      let node = level.get(name)
      if (!node) {
        node = { name, path: currentPath, children: new Map() }
        level.set(name, node)
      }
      if (index === segments.length - 1) node.size = entry.size
      level = node.children
    })
  })

  const toTreeNodes = (nodes: Map<string, MutableTreeNode>): SourceTreeNode[] =>
    [...nodes.values()]
      .sort((left, right) => {
        const leftDirectory = left.children.size > 0
        const rightDirectory = right.children.size > 0
        if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1
        return left.name.localeCompare(right.name)
      })
      .map((node) => {
        const isDirectory = node.children.size > 0
        return {
          key: `${source.id}:${node.path}`,
          title: isDirectory ? (
            node.name
          ) : (
            <span className={'wa-source-tree__file'}>
              <span>{node.name}</span>
              <span>{formatSize(node.size ?? 0)}</span>
            </span>
          ),
          icon: isDirectory ? <FolderOpenOutlined /> : <FileOutlined />,
          children: isDirectory ? toTreeNodes(node.children) : undefined,
        }
      })

  return toTreeNodes(root)
}

export function AssistantDetailPage() {
  const { assistantId } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const id = Number(assistantId)

  const [assistant, setAssistant] = useState<Assistant | null>(null)
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [activeUploads, setActiveUploads] = useState(0)
  const [expandedSources, setExpandedSources] = useState<Set<number>>(() => new Set())

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
    setActiveUploads((count) => count + 1)
    try {
      const source = await uploadSource(id, file)
      setSources((prev) => [source, ...prev])
      message.success(`已上传「${source.title}」，等待索引`)
    } catch (error) {
      message.error(getErrorMessage(error, '上传失败'))
    } finally {
      setActiveUploads((count) => count - 1)
    }
  }

  const handleDirectoryUpload = async (files: File[]) => {
    setActiveUploads((count) => count + 1)
    try {
      const source = await uploadDirectorySource(id, files)
      setSources((prev) => [source, ...prev])
      setExpandedSources((prev) => new Set(prev).add(source.id))
      message.success(`已上传文件夹「${source.title}」，等待索引`)
    } catch (error) {
      message.error(getErrorMessage(error, '文件夹上传失败'))
    } finally {
      setActiveUploads((count) => count - 1)
    }
  }

  const handleDeleteSource = async (sourceId: number) => {
    try {
      await deleteSource(id, sourceId)
      setSources((prev) => prev.filter((s) => s.id !== sourceId))
      setExpandedSources((prev) => {
        const next = new Set(prev)
        next.delete(sourceId)
        return next
      })
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

  const toggleSourceTree = (sourceId: number) => {
    setExpandedSources((prev) => {
      const next = new Set(prev)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  if (!assistant) {
    return (
      <div className="wa-page">
        <Card loading={loading} />
      </div>
    )
  }

  return (
    <div className="wa-page">
      <div className="wa-page-head wa-detail-head">
        <div className="wa-detail-identity">
          <span className="wa-avatar wa-avatar--lg">{assistant.avatar ?? '🤖'}</span>
          <div className="wa-detail-identity__copy">
            <Typography.Title level={4} className="wa-page-head__title">
              {assistant.name}
            </Typography.Title>
            <Typography.Text type="secondary" className="wa-page-head__desc">
              {assistant.description || '暂无简介'}
            </Typography.Text>
          </div>
        </div>
        <div className="wa-page-head__actions">
          <Button className="wa-back-button" onClick={() => navigate('/assistant')}>
            返回列表
          </Button>
        </div>
      </div>

      <Tabs
        className="wa-tabs"
        defaultActiveKey="knowledge"
        items={[
          {
            key: 'knowledge',
            label: '知识库',
            children: (
              <div className="wa-tab-stack">
                <div className="wa-upload-grid">
                  <Upload.Dragger
                    className="wa-upload-dragger"
                    multiple
                    disabled={activeUploads > 0}
                    showUploadList={false}
                    beforeUpload={(file) => {
                      void handleUpload(file)
                      return Upload.LIST_IGNORE
                    }}
                  >
                    <p className="ant-upload-drag-icon">
                      <FileZipOutlined />
                    </p>
                    <p className="ant-upload-text">文件或 ZIP</p>
                    <p className="ant-upload-hint">拖拽到这里，或点击选择</p>
                  </Upload.Dragger>
                  <Upload.Dragger
                    className="wa-upload-dragger wa-upload-dragger--folder"
                    directory
                    multiple
                    disabled={activeUploads > 0}
                    showUploadList={false}
                    beforeUpload={(file, fileList) => {
                      if (file.uid === fileList[0]?.uid) void handleDirectoryUpload([...fileList])
                      return Upload.LIST_IGNORE
                    }}
                  >
                    <p className="ant-upload-drag-icon">
                      <FolderOpenOutlined />
                    </p>
                    <p className="ant-upload-text">文件夹</p>
                    <p className="ant-upload-hint">拖拽到这里，或点击选择</p>
                  </Upload.Dragger>
                </div>
                <div className="wa-upload-note">
                  <UploadOutlined />
                  <span>文件夹与 ZIP 会保留目录路径；校验失败时整包不入库。</span>
                </div>
                <Card size="small" title={`知识源（${sources.length}）`} className="wa-sources-card">
                  {sources.length === 0 ? (
                    <Empty description="还没有知识源" />
                  ) : (
                    sources.map((source) => {
                      const hasTree = source.type === 'directory' || source.type === 'archive'
                      const expanded = expandedSources.has(source.id)
                      return (
                        <div key={source.id} className="wa-source-item">
                          <div className="wa-source-row">
                            <div className="wa-source-row__main">
                              <span className="wa-source-row__title">
                                {hasTree ? <FolderOpenOutlined /> : <FileTextOutlined />}
                                {source.title}
                              </span>
                              <span className="wa-source-row__meta">
                                {formatSize(source.size)} · {source.entries.length} 个文件 · v{source.version}
                              </span>
                            </div>
                            <Tag className={`wa-status wa-status--${source.status}`}>
                              {SOURCE_STATUS[source.status]?.label ?? source.status}
                            </Tag>
                            <div className="wa-source-row__actions">
                              {hasTree && (
                                <Tooltip title={expanded ? '收起目录' : '展开目录'}>
                                  <Button
                                    type="text"
                                    size="small"
                                    aria-label={expanded ? '收起目录' : '展开目录'}
                                    aria-expanded={expanded}
                                    icon={expanded ? <DownOutlined /> : <RightOutlined />}
                                    onClick={() => toggleSourceTree(source.id)}
                                  />
                                </Tooltip>
                              )}
                              <Button
                                type="text"
                                size="small"
                                onClick={() => void handleReindexSource(source.id)}
                                disabled={source.status === 'processing'}
                              >
                                重新索引
                              </Button>
                              <Tooltip title="删除知识源">
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  aria-label="删除知识源"
                                  icon={<DeleteOutlined />}
                                  onClick={() => void handleDeleteSource(source.id)}
                                />
                              </Tooltip>
                            </div>
                          </div>
                          {hasTree && expanded && (
                            <div className="wa-source-tree">
                              <Tree
                                showIcon
                                selectable={false}
                                virtual
                                height={280}
                                treeData={buildSourceTree(source)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </Card>
              </div>
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
              <RulesTab assistantId={id} assistant={assistant} onAssistantSaved={(updated) => setAssistant(updated)} />
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
