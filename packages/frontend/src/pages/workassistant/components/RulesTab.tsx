import { useCallback, useEffect, useState } from 'react'
import { App, Button, Card, Form, Input, List, Modal, Space, Tag, Typography } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import type { Assistant, AssistantFaq } from '../../../entities'
import { createFaq, deleteFaq, fetchFaqs, updateAssistant, updateFaq } from '../../../shared/api'

interface RulesTabProps {
  assistantId: number
  assistant: Assistant
  onAssistantSaved: (assistant: Assistant) => void
}

interface FaqForm {
  question: string
  answer: string
}

export function RulesTab({ assistantId, assistant, onAssistantSaved }: RulesTabProps) {
  const { message } = App.useApp()
  const [rules, setRules] = useState(assistant.system_rules ?? '')
  const [savingRules, setSavingRules] = useState(false)
  const [faqs, setFaqs] = useState<AssistantFaq[]>([])
  const [editing, setEditing] = useState<AssistantFaq | null>(null)
  const [form] = Form.useForm<FaqForm>()

  const refreshFaqs = useCallback(async () => {
    try {
      setFaqs(await fetchFaqs(assistantId))
    } catch {
      // 静默
    }
  }, [assistantId])

  useEffect(() => {
    setRules(assistant.system_rules ?? '')
    void refreshFaqs()
  }, [assistant.system_rules, refreshFaqs])

  const saveRules = async () => {
    setSavingRules(true)
    try {
      const updated = await updateAssistant(assistantId, { system_rules: rules })
      onAssistantSaved(updated)
      message.success('规则已保存')
    } catch {
      message.error('保存失败')
    } finally {
      setSavingRules(false)
    }
  }

  const openCreate = () => {
    form.resetFields()
    setEditing({ id: 0, assistant_id: assistantId, question: '', answer: '', kind: 'faq', created_at: '', updated_at: '' })
  }

  const openEdit = (faq: AssistantFaq) => {
    form.setFieldsValue({ question: faq.question, answer: faq.answer })
    setEditing(faq)
  }

  const submitFaq = async () => {
    if (!editing) return
    const values = await form.validateFields()
    try {
      if (editing.id === 0) {
        await createFaq(assistantId, { ...values, kind: 'faq' })
        message.success('已添加固定话术')
      } else {
        await updateFaq(assistantId, editing.id, values)
        message.success('已更新固定话术')
      }
      setEditing(null)
      await refreshFaqs()
    } catch {
      message.error('保存失败')
    }
  }

  const removeFaq = async (faqId: number) => {
    try {
      await deleteFaq(assistantId, faqId)
      await refreshFaqs()
      message.success('已删除')
    } catch {
      message.error('删除失败')
    }
  }

  return (
    <Space orientation="vertical" size={14} style={{ width: '100%' }}>
      <Card size="small" title="语气与规则">
        <Form layout="vertical">
          <Form.Item label="系统规则（语气 / 边界 / 固定口径）">
            <Input.TextArea
              rows={5}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              placeholder="例如：回答保持专业简洁；涉及报价先说明口径依据；不承诺合同外条款……"
            />
          </Form.Item>
          <Button type="primary" loading={savingRules} onClick={() => void saveRules()}>
            保存规则
          </Button>
        </Form>
      </Card>

      <Card
        size="small"
        title={`固定话术（${faqs.filter((f) => f.kind === 'faq').length}）`}
        extra={
          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            添加
          </Button>
        }
      >
        <List
          dataSource={faqs}
          locale={{ emptyText: <Typography.Text type="secondary">还没有固定话术</Typography.Text> }}
          renderItem={(faq) => (
            <List.Item
              actions={[
                <Button key="edit" type="text" icon={<EditOutlined />} onClick={() => openEdit(faq)} />,
                <Button key="del" type="text" danger icon={<DeleteOutlined />} onClick={() => void removeFaq(faq.id)} />,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={6}>
                    <Tag color={faq.kind === 'faq' ? 'cyan' : 'green'}>{faq.kind === 'faq' ? '固定话术' : '知识条目'}</Tag>
                    <span>{faq.question}</span>
                  </Space>
                }
                description={faq.answer}
              />
            </List.Item>
          )}
        />
      </Card>

      <Modal
        title={editing?.id === 0 ? '添加固定话术' : '编辑固定话术'}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => void submitFaq()}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="question" label="问题" rules={[{ required: true, message: '请输入问题' }]}>
            <Input placeholder="访客可能怎么问？" />
          </Form.Item>
          <Form.Item name="answer" label="标准答案" rules={[{ required: true, message: '请输入答案' }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
