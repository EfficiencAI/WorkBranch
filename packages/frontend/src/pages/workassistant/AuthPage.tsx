import { useState } from 'react'
import { App, Button, Card, Divider, Form, Input, Tabs, Typography } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { selectAuthError, selectAuthLoading, useAuthStore } from '../../features/auth'

type AuthMode = 'login' | 'register'

export function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { message } = App.useApp()
  const [mode, setMode] = useState<AuthMode>('login')
  const loading = useAuthStore(selectAuthLoading)
  const error = useAuthStore(selectAuthError)
  const login = useAuthStore((state) => state.login)
  const register = useAuthStore((state) => state.register)
  const loginLocal = useAuthStore((state) => state.loginLocal)

  const from = (location.state as { from?: string } | null)?.from

  const handleFinish = async (values: { username: string; password: string; display_name?: string }) => {
    const ok = mode === 'login'
      ? await login(values.username, values.password)
      : await register(values.username, values.password, values.display_name)
    if (ok) {
      message.success(mode === 'login' ? '欢迎回来' : '注册成功，已自动登录')
      navigate(from && from.startsWith('/assistant') ? from : '/assistant')
    }
  }

  const handleLocalOffline = () => {
    loginLocal()
    message.info('已进入本地离线模式')
    navigate('/chat')
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <div className="auth-brand">
          <Typography.Title level={4} style={{ margin: '10px 0 2px' }}>
            WorkAssistant
          </Typography.Title>
          <Typography.Text type="secondary">企业内部 AI 助手中心</Typography.Text>
        </div>
        <Tabs
          activeKey={mode}
          onChange={(key) => setMode(key as AuthMode)}
          items={[
            { key: 'login', label: '登录' },
            { key: 'register', label: '注册' },
          ]}
        />
        <Form layout="vertical" onFinish={handleFinish} requiredMark={false}>
          {mode === 'register' ? (
            <Form.Item label="昵称" name="display_name">
              <Input placeholder="显示名称（可选）" />
            </Form.Item>
          ) : null}
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="username" autoComplete="username" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="至少 6 位" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Form.Item>
          {error ? <Typography.Text type="danger">{error}</Typography.Text> : null}
          <Button type="primary" htmlType="submit" block loading={loading} style={{ marginTop: 14 }}>
            {mode === 'login' ? '登录' : '注册并登录'}
          </Button>
        </Form>
        <Divider plain style={{ fontSize: 11, color: '#64748b', margin: '18px 0 12px' }}>
          或
        </Divider>
        <Button block type="dashed" onClick={handleLocalOffline}>
          本地离线使用（无需账号）
        </Button>
        <Typography.Text
          type="secondary"
          style={{ display: 'block', textAlign: 'center', marginTop: 8, fontSize: 11 }}
        >
          数据保存在本地，登录后可与账号数据分开管理
        </Typography.Text>
      </Card>
    </div>
  )
}
