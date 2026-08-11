import { Button, Form, Input, Modal, Typography, message } from 'antd'
import {
  CheckCircleFilled,
  CloseCircleFilled,
  KeyOutlined,
  LinkOutlined,
  RobotOutlined,
} from '@ant-design/icons'
import { useCallback, useEffect, useState } from 'react'
import type { OnboardingStep } from '../../app/onboarding'
import { useOnboarding } from '../../app/onboarding'
import { useSettings } from '../../app/settings'
import { getErrorMessage } from '../../shared/api/error'
import { testLlmConnection } from '../../shared/api/settings'
import '../../styles/onboarding.css'

const { Title, Text } = Typography

const STEP_LIST: {
  key: OnboardingStep
  title: string
  icon: React.ReactNode
  placeholder: string
  help: string
  inputType?: 'password' | 'url' | 'text'
}[] = [
  {
    key: 'api_key',
    title: 'API Key',
    icon: <KeyOutlined />,
    placeholder: 'sk-...',
    help: '用于调用 LLM 服务的身份验证，仅保存在本机',
    inputType: 'password',
  },
  {
    key: 'base_url',
    title: 'Base URL',
    icon: <LinkOutlined />,
    placeholder: 'https://api.openai.com/v1',
    help: '默认 OpenAI 兼容格式，自定义服务请填写对应地址',
    inputType: 'url',
  },
  {
    key: 'model',
    title: '模型名称',
    icon: <RobotOutlined />,
    placeholder: 'gpt-4o-mini',
    help: '使用该服务商提供的任意可用模型名称',
  },
]

type TestState = { ok: true; latencyMs: number } | { ok: false; message: string } | null

export function OnboardingWizard() {
  const { visible, currentStep, completeOnboarding, skipOnboarding, goToStep } = useOnboarding()
  const { patchSettings, settings } = useSettings()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testState, setTestState] = useState<TestState>(null)
  const stepIndex = STEP_LIST.findIndex((s) => s.key === currentStep)
  const formValues = Form.useWatch([], form)
  const allFilled =
    typeof formValues === 'object' &&
    formValues !== null &&
    ['api_key', 'base_url', 'model'].every(
      (key) =>
        typeof (formValues as Record<string, unknown>)[key] === 'string' &&
        String((formValues as Record<string, unknown>)[key]).length > 0,
    )

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
    } catch {
      message.error('请检查输入内容')
      return
    }
    try {
      setSubmitting(true)
      const values = form.getFieldsValue()
      if (typeof values.api_key === 'string') {
        values.api_key = values.api_key.replace(/^["']+|["']+$/g, '')
      }
      await patchSettings({ llm: values })
      message.success('配置已保存')
      completeOnboarding()
    } catch (err) {
      message.error(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setSubmitting(false)
    }
  }, [form, patchSettings, completeOnboarding])

  const handleTestConnection = useCallback(async () => {
    try {
      await form.validateFields()
    } catch {
      message.error('请先完整填写三项配置')
      return
    }
    setTesting(true)
    setTestState(null)
    try {
      const values = form.getFieldsValue()
      const result = await testLlmConnection({
        api_key: String(values.api_key),
        base_url: String(values.base_url),
        model: String(values.model),
      })
      setTestState({ ok: true, latencyMs: result.latencyMs })
    } catch (err) {
      setTestState({ ok: false, message: getErrorMessage(err, '连接失败') })
    } finally {
      setTesting(false)
    }
  }, [form])

  const isLastStep = stepIndex === STEP_LIST.length - 1

  return (
    <Modal
      open={visible}
      title={null}
      footer={null}
      closable={false}
      centered
      width={500}
      mask={{ closable: false }}
      rootClassName="wa-onboarding"
    >
      <div className="wa-onboarding__head">
        <div className="wa-onboarding__brand">WB</div>
        <div className="wa-onboarding__copy">
          <span className="wa-onboarding__eyebrow">首次配置 · 第 {stepIndex + 1} 步</span>
          <Title level={3} className="wa-onboarding__title">欢迎使用 WorkBranch</Title>
          <Text className="wa-onboarding__sub">连接你的 LLM 服务后，即可开始对话与工作流配置</Text>
        </div>
      </div>

      <div className="wa-onboarding__steps">
        {STEP_LIST.map((step, index) => (
          <div
            key={step.key}
            className={[
              'wa-onboarding__step',
              index === stepIndex ? 'wa-onboarding__step--active' : '',
              index < stepIndex ? 'wa-onboarding__step--done' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="wa-onboarding__step-chip">{step.icon}</span>
            <span className="wa-onboarding__step-label">{step.title}</span>
          </div>
        ))}
      </div>

      <Form form={form} layout="vertical" requiredMark={false}>
        {STEP_LIST.map((step) => (
          <Form.Item
            key={step.key}
            name={step.key}
            hidden={step.key !== current.key}
            label={step.title}
            className="wa-onboarding__field"
            rules={[
              { required: true, message: `请输入${step.title}` },
              ...(step.key === 'base_url' ? [{ type: 'url', message: '请输入有效的 URL' } as const] : []),
            ]}
            help={step.help}
          >
            <Input
              size="large"
              prefix={step.icon}
              placeholder={step.placeholder}
              type={step.inputType ?? 'text'}
              onPressEnter={isLastStep ? handleFinish : handleNext}
            />
          </Form.Item>
        ))}
      </Form>

      {testState && (
        <div className={`wa-onboarding__test wa-onboarding__test--${testState.ok ? 'success' : 'error'}`}>
          {testState.ok ? <CheckCircleFilled /> : <CloseCircleFilled />}
          <span>{testState.ok ? `连接成功 · 延迟 ${testState.latencyMs} ms` : testState.message}</span>
        </div>
      )}

      <div className="wa-onboarding__hint">配置后可在「设置 → LLM」中随时修改，无需重新安装</div>

      <div className="wa-onboarding__footer">
        <Button onClick={skipOnboarding}>跳过</Button>
        <div className="wa-onboarding__footer-right">
          <Button disabled={!allFilled} loading={testing} onClick={handleTestConnection}>
            测试连接
          </Button>
          {stepIndex > 0 && (
            <Button
              onClick={() => {
                const prev = STEP_LIST[stepIndex - 1]
                goToStep(prev.key)
              }}
            >
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
