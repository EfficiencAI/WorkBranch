import { Button, Form, Input, Modal, Steps, Typography, message } from 'antd'
import { KeyOutlined, LinkOutlined, RobotOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useState } from 'react'
import type { OnboardingStep } from '../../app/onboarding'
import { useOnboarding } from '../../app/onboarding'
import { useSettings } from '../../app/settings'

const { Title, Text } = Typography

const STEP_LIST: { key: OnboardingStep; title: string; icon: React.ReactNode; placeholder: string; help: string }[] = [
  {
    key: 'api_key',
    title: 'API Key',
    icon: <KeyOutlined />,
    placeholder: 'sk-...',
    help: '输入你的 LLM 服务 API Key，用于身份验证',
  },
  {
    key: 'base_url',
    title: 'Base URL',
    icon: <LinkOutlined />,
    placeholder: 'https://api.openai.com/v1',
    help: 'LLM 服务的接口地址，默认为 OpenAI 兼容格式',
  },
  {
    key: 'model',
    title: '模型名称',
    icon: <RobotOutlined />,
    placeholder: 'gpt-4o-mini',
    help: '指定要使用的模型名称',
  },
]

export function OnboardingWizard() {
  const { visible, currentStep, completeOnboarding, skipOnboarding, goToStep } = useOnboarding()
  const { patchSettings, settings } = useSettings()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const stepIndex = STEP_LIST.findIndex((s) => s.key === currentStep)

  useEffect(() => {
    if (visible && settings?.llm && typeof settings.llm === 'object' && !Array.isArray(settings.llm)) {
      const llm = settings.llm as Record<string, unknown>
      form.setFieldsValue({
        api_key: (llm.api_key as string) ?? '',
        base_url: (llm.base_url as string) ?? '',
        model: (llm.model as string) ?? '',
      })
    }
  }, [visible, settings, form])

  const current = STEP_LIST[stepIndex]

  const handleNext = useCallback(async () => {
    try {
      await form.validateFields([current.key])
      if (stepIndex < STEP_LIST.length - 1) {
        const next = STEP_LIST[stepIndex + 1]
        goToStep(next.key)
      }
    } catch {
      // validation failed
    }
  }, [form, current, stepIndex, goToStep])

  const handleFinish = useCallback(async () => {
    try {
      await form.validateFields()
      setSubmitting(true)
      const values = form.getFieldsValue()
      await patchSettings({ llm: values })
      message.success('配置已保存')
      completeOnboarding()
    } catch {
      message.error('保存失败，请检查输入')
    } finally {
      setSubmitting(false)
    }
  }, [form, patchSettings, completeOnboarding])

  const isLastStep = stepIndex === STEP_LIST.length - 1

  return (
    <Modal
      open={visible}
      title={null}
      footer={null}
      closable={false}
      centered
      width={520}
      maskClosable={false}
      styles={{ body: { padding: '32px 24px 16px' } }}
    >
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <Title level={3} style={{ margin: 0 }}>欢迎使用 WorkBranch</Title>
        <Text type="secondary">请先完成基础配置以开始使用</Text>
      </div>

      <Steps items={STEP_LIST.map((s) => ({ title: s.title, icon: s.icon }))} current={stepIndex} size="small" style={{ marginBottom: 24 }} />

      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name={current.key}
          rules={[
            { required: true, message: `请输入${current.title}` },
            ...(current.key === 'base_url'
              ? [{ type: 'url', message: '请输入有效的 URL' } as const]
              : []),
          ]}
          help={current.help}
        >
          <Input
            size="large"
            placeholder={current.placeholder}
            type={current.key === 'api_key' ? 'password' : 'text'}
            onPressEnter={isLastStep ? handleFinish : handleNext}
          />
        </Form.Item>
      </Form>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <Button onClick={skipOnboarding}>跳过</Button>
        <div>
          {stepIndex > 0 && (
            <Button style={{ marginRight: 8 }} onClick={() => {
              const prev = STEP_LIST[stepIndex - 1]
              goToStep(prev.key)
            }}>
              上一步
            </Button>
          )}
          <Button type="primary" loading={submitting} onClick={isLastStep ? handleFinish : handleNext}>
            {isLastStep ? '完成' : '下一步'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
