import { useCallback, useEffect, useState } from 'react'
import { Card, Col, Row, Statistic, Typography } from 'antd'
import type { AssistantStats } from '../../../shared/api'
import { fetchStats } from '../../../shared/api'

interface StatsTabProps {
  assistantId: number
}

export function StatsTab({ assistantId }: StatsTabProps) {
  const [stats, setStats] = useState<AssistantStats | null>(null)

  const load = useCallback(async () => {
    try {
      setStats(await fetchStats(assistantId))
    } catch {
      // 静默
    }
  }, [assistantId])

  useEffect(() => {
    void load()
  }, [load])

  const maxBar = Math.max(1, ...(stats?.last7d.map((d) => d.count) ?? [1]))

  return (
    <Row gutter={[14, 14]}>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic title="今日问答" value={stats?.todayAnswers ?? 0} />
        </Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic title="累计问答" value={stats?.totalAnswers ?? 0} />
        </Card>
      </Col>
      <Col xs={24} sm={8}>
        <Card size="small">
          <Statistic title="知识缺口" value={stats?.gapCount ?? 0} valueStyle={{ color: '#fbbf24' }} />
        </Card>
      </Col>

      <Col xs={24} lg={14}>
        <Card size="small" title="近 7 日问答">
          <div className="stats-bars">
            {(stats?.last7d ?? []).map((day) => (
              <div key={day.date} className="stats-bar-col">
                <div className="stats-bar" style={{ height: `${Math.max(4, (day.count / maxBar) * 90)}px` }} />
                <span className="stats-bar-label">{day.date.slice(5)}</span>
                <span className="stats-bar-value">{day.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </Col>

      <Col xs={24} lg={10}>
        <Card size="small" title="高频问题 Top 5">
          {(stats?.topQuestions ?? []).length === 0 ? (
            <Typography.Text type="secondary">还没有访客提问</Typography.Text>
          ) : (
            (stats?.topQuestions ?? []).map((item, index) => (
              <div key={item.question} className="topq-row">
                <span className="topq-rank">{index + 1}</span>
                <span className="topq-text" title={item.question}>{item.question}</span>
                <span className="topq-count">{item.count}</span>
              </div>
            ))
          )}
        </Card>
      </Col>
    </Row>
  )
}
