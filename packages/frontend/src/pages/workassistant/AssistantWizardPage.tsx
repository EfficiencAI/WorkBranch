import { useState } from 'react'
import { App, Button, Card, Form, Input, Steps, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import { createAssistant } from '../../shared/api'

interface WizardForm {
  name: string
  description?: string
  avatar?: string
}

export function AssistantWizardPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const handleFinish = async (values: WizardForm) => {
    setSubmitting(true)
    try {
      const assistant = await createAssistant(values)
      message.success(`已创建「${assistant.name}」`)
      navigate(`/assistant/${assistant.id}`)
    } catch {
      message.error('创建失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="wa-page wa-page--narrow">
      <Steps
        className="wa-wizard__steps"
        current={step}
        items={[{ title: '基本信息' }, { title: '创建' }]}
      />
      <Card className="wa-wizard__card">
        <Form layout="vertical" onFinish={handleFinish} requiredMark={false} initialValues={{ avatar: '🤖' }}>
          {step === 0 ? (
            <>
              <Form.Item label="助手名称" name="name" rules={[{ required: true, message: '请输入助手名称' }]}>
                <Input placeholder="例如：售前产品专家" />
              </Form.Item>
              <Form.Item label="头像（emoji）" name="avatar">
                <Input placeholder="🤖" maxLength={4} />
              </Form.Item>
              <Form.Item label="一句话介绍" name="description">
                <Input.TextArea rows={3} placeholder="这个助手负责什么信息？" />
              </Form.Item>
              <div className="wa-wizard__hint">
                <span>创建后进入助手详情：上传知识 → 对话训练（用户说明 / AI 主动提问）→ 分享给同事。</span>
              </div>
              <div className="wa-wizard__actions">
                <Button type="primary" onClick={() => setStep(1)}>
                  下一步
                </Button>
              </div>
            </>
          ) : (
            <>
              <Form.Item label="助手名称" name="name" hidden />
              <Form.Item label="头像（emoji）" name="avatar" hidden />
              <Form.Item label="一句话介绍" name="description" hidden />
              <Typography.Paragraph className="wa-wizard__review">
                确认信息无误后创建助手，随后进入训练页。
              </Typography.Paragraph>
              <div className="wa-wizard__review-actions">
                <Button onClick={() => setStep(0)}>上一步</Button>
                <Button type="primary" htmlType="submit" loading={submitting}>
                  创建并进入训练
                </Button>
              </div>
            </>
          )}
        </Form>
      </Card>
    </div>
  )
}
