import { useCallback, useEffect, useState } from 'react'
import { App, Button, Card, Input, List, Select, Space, Switch, Tag, Typography } from 'antd'
import { DownloadOutlined, LinkOutlined, PlusOutlined, QrcodeOutlined } from '@ant-design/icons'
import QRCode from 'qrcode'
import type { ShareInfo } from '../../../entities'
import { createShare, exportAssistant, fetchShares, setShareEnabled } from '../../../shared/api'

interface SharesTabProps {
  assistantId: number
}

export function SharesTab({ assistantId }: SharesTabProps) {
  const { message } = App.useApp()
  const [shares, setShares] = useState<ShareInfo[]>([])
  const [mode, setMode] = useState<'public' | 'password'>('public')
  const [password, setPassword] = useState('')
  const [expiresIn, setExpiresIn] = useState(0)
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [qrFor, setQrFor] = useState<string | null>(null)
  const baseUrl = `${window.location.origin}/s`

  const refresh = useCallback(async () => {
    try {
      setShares(await fetchShares(assistantId))
    } catch {
      // 静默
    }
  }, [assistantId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const showQr = async (share: ShareInfo) => {
    try {
      const url = `${baseUrl}/${share.token}`
      setQrFor(share.token)
      setQrUrl(await QRCode.toDataURL(url, { width: 180, margin: 1 }))
    } catch {
      message.error('二维码生成失败')
    }
  }

  const handleCreate = async () => {
    if (mode === 'password' && password.trim().length < 4) {
      message.warning('访问密码至少 4 位')
      return
    }
    setCreating(true)
    try {
      const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 86400000).toISOString() : undefined
      const share = await createShare(assistantId, {
        mode,
        password: mode === 'password' ? password.trim() : undefined,
        expires_at: expiresAt,
      })
      setShares((prev) => [share, ...prev])
      setPassword('')
      message.success('分享链接已生成')
      void showQr(share)
    } catch {
      message.error('创建分享失败')
    } finally {
      setCreating(false)
    }
  }

  const handleToggle = async (share: ShareInfo, enabled: boolean) => {
    try {
      const updated = await setShareEnabled(assistantId, share.id, enabled)
      setShares((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
    } catch {
      message.error('操作失败')
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const pkg = await exportAssistant(assistantId)
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${pkg.assistant.name || 'assistant'}.wa.json`
      anchor.click()
      URL.revokeObjectURL(url)
      message.success('已导出助手包')
    } catch {
      message.error('导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Card size="small" title="创建分享入口">
        <Space wrap size={10}>
          <Select
            value={mode}
            onChange={(value) => setMode(value as 'public' | 'password')}
            style={{ width: 120 }}
            options={[
              { label: '公开访问', value: 'public' },
              { label: '密码访问', value: 'password' },
            ]}
          />
          {mode === 'password' ? (
            <Input.Password
              placeholder="访问密码（至少 4 位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: 180 }}
            />
          ) : null}
          <Select
            value={expiresIn}
            onChange={setExpiresIn}
            style={{ width: 140 }}
            options={[
              { label: '永不过期', value: 0 },
              { label: '7 天后过期', value: 7 },
              { label: '30 天后过期', value: 30 },
              { label: '90 天后过期', value: 90 },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} loading={creating} onClick={() => void handleCreate()}>
            生成链接
          </Button>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={() => void handleExport()}>
            导出助手包
          </Button>
        </Space>
      </Card>

      <List
        dataSource={shares}
        locale={{ emptyText: <Typography.Text type="secondary">还没有分享入口，先生成一个链接</Typography.Text> }}
        renderItem={(share) => (
          <Card size="small" style={{ marginBottom: 10 }}>
            <Space align="start" size={16} style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space direction="vertical" size={6} style={{ flex: 1, minWidth: 0 }}>
                <Space size={6}>
                  <LinkOutlined />
                  <Typography.Text copyable code>{`${baseUrl}/${share.token}`}</Typography.Text>
                  <Tag color={share.mode === 'password' ? 'orange' : 'cyan'}>
                    {share.mode === 'password' ? '密码访问' : '公开'}
                  </Tag>
                  {share.expires_at ? <Tag color="default">过期：{new Date(share.expires_at).toLocaleDateString()}</Tag> : null}
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  创建于 {new Date(share.created_at).toLocaleString()}
                </Typography.Text>
                {qrFor === share.token && qrUrl ? (
                  <img src={qrUrl} alt="二维码" style={{ width: 140, height: 140, border: '1px solid var(--app-border)', borderRadius: 8 }} />
                ) : null}
              </Space>
              <Space size={8}>
                <Button size="small" icon={<QrcodeOutlined />} onClick={() => void showQr(share)}>
                  二维码
                </Button>
                <Switch checked={Boolean(share.enabled)} onChange={(checked) => void handleToggle(share, checked)} />
              </Space>
            </Space>
          </Card>
        )}
      />
    </Space>
  )
}
