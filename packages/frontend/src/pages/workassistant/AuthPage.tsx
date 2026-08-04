import { useState } from 'react'
import { App, Button, Card, Form, Input, Tabs, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { selectAuthError, selectAuthLoading, useAuthStore } from '../../features/auth'

type AuthMode = 'login' | 'register'

export function AuthPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [mode, setMode] = useState<AuthMode>('login')
  const loading = useAuthStore(selectAuthLoading)
  const error = useAuthStore(selectAuthError)
  const login = useAuthStore((state) => state.login)
  const register = useAuthStore((state) => state.register)

  const handleFinish = async (values: { username: string; password: string; display_name?: string }) => {
    const ok = mode === 'login'
      ? await login(values.username, values.password)
      : await register(values.username, values.password, values.display_name)
    if (ok) {
      message.success(mode === 'login' ? '欢迎回来' : '注册成功，已自动登录')
      navigate('/assistant')
    }
  }

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <div className="auth-brand">
          <span className="wa-logo wa-logo--lg">WA</span>
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
      </Card>
    </div>
  )
}
