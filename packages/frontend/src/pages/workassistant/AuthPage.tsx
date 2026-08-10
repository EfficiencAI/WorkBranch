import { useState } from 'react'
import { App, Button, Card, Divider, Form, Input, Modal, Tabs, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { selectAuthError, selectAuthLoading, useAuthStore } from '../../features/auth'

type AuthMode = 'login' | 'register'

export function AuthPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [mode, setMode] = useState<AuthMode>('login')
  const [onlineUnsupportedVisible, setOnlineUnsupportedVisible] = useState(false)
  const loading = useAuthStore(selectAuthLoading)
  const error = useAuthStore(selectAuthError)
  const loginLocal = useAuthStore((state) => state.loginLocal)

  const handleFinish = async () => {
    // 线上服务暂不支持：保留表单校验，提交时提示改用离线模式
    setOnlineUnsupportedVisible(true)
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
          <span className="auth-logo">WA</span>
          <Typography.Title level={4} className="auth-brand__title">
            WorkAssistant
          </Typography.Title>
          <Typography.Text type="secondary">企业内部 AI 助手中心</Typography.Text>
        </div>
        <Tabs
          className="auth-tabs"
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
          <Button className="auth-submit" type="primary" htmlType="submit" block loading={loading}>
            {mode === 'login' ? '登录' : '注册并登录'}
          </Button>
        </Form>
        <Divider className="auth-divider" plain>
          或
        </Divider>
        <Button block type="dashed" onClick={handleLocalOffline}>
          本地离线使用（无需账号）
        </Button>
        <Typography.Text type="secondary" className="auth-local-note">
          数据保存在本地，登录后可与账号数据分开管理
        </Typography.Text>
      </Card>
      <Modal
        open={onlineUnsupportedVisible}
        title="提示"
        onOk={() => setOnlineUnsupportedVisible(false)}
        onCancel={() => setOnlineUnsupportedVisible(false)}
        okText="知道了"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        线上服务暂不支持，请使用离线模式
      </Modal>
    </div>
  )
}
