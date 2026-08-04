import { useEffect, useState } from 'react'
import { App, Button, Card, Col, Empty, List, Row, Space, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { Assistant } from '../../entities'
import { selectAuthUser, useAuthStore } from '../../features/auth'
import { fetchAssistants } from '../../shared/api'

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  disabled: '已停用',
}

export function WorkAssistantHomePage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const user = useAuthStore(selectAuthUser)
  const loadSession = useAuthStore((state) => state.loadSession)
  const [assistants, setAssistants] = useState<Assistant[]>([])
  const [loading, setLoading] = useState(false)

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
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            我的助手
          </Typography.Title>
          <Typography.Text type="secondary">把知识沉淀成可并发接待的 AI 分身</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/assistant/new')}>
          新建助手
        </Button>
      </div>

      <List
        grid={{ gutter: 14, xs: 1, sm: 2, lg: 3 }}
        dataSource={assistants}
        loading={loading}
        locale={{ emptyText: <Empty description="还没有助手，点击右上角创建一个" /> }}
        renderItem={(assistant) => (
          <List.Item>
            <Card
              hoverable
              onClick={() => navigate(`/assistant/${assistant.id}`)}
              styles={{ body: { padding: 16 } }}
            >
              <Row align="middle" gutter={12}>
                <Col flex="none">
                  <span className="wa-avatar">{assistant.avatar ?? '🤖'}</span>
                </Col>
                <Col flex="auto">
                  <Space direction="vertical" size={2}>
                    <Typography.Text strong>{assistant.name}</Typography.Text>
                    <Tag color={assistant.status === 'published' ? 'success' : 'default'}>
                      {STATUS_LABEL[assistant.status] ?? assistant.status}
                    </Tag>
                  </Space>
                </Col>
              </Row>
              <Typography.Paragraph type="secondary" style={{ margin: '12px 0 4px', minHeight: 38 }}>
                {assistant.description || '暂无简介'}
              </Typography.Paragraph>
            </Card>
          </List.Item>
        )}
      />
    </div>
  )
}
