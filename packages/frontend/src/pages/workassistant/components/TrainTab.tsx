import { useCallback, useEffect, useRef, useState } from 'react'
import { App, Button, Card, Input, Modal, Segmented, Space, Tag, Typography } from 'antd'
import { DeleteOutlined, SendOutlined } from '@ant-design/icons'
import type { AssistantFaq } from '../../../entities'
import {
  createFaq,
  deleteFaq,
  fetchFaqs,
  runAiCheck,
  streamTrainAnswer,
} from '../../../shared/api'

interface TrainMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: string[]
}

interface TrainTabProps {
  assistantId: number
  quickQuestions?: string[]
}

type TrainMode = 'user' | 'ai'
type AiPhase = 'idle' | 'gap' | 'scan' | 'done'

function upsertAssistant(prev: TrainMessage[], content: string, sources?: string[]): TrainMessage[] {
  const next = [...prev]
  if (next[next.length - 1]?.role === 'assistant') {
    next[next.length - 1] = { role: 'assistant', content, sources }
  } else {
    next.push({ role: 'assistant', content, sources })
  }
  return next
}

export function TrainTab({ assistantId, quickQuestions = [] }: TrainTabProps) {
  const { message } = App.useApp()
  const [messages, setMessages] = useState<TrainMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [faqs, setFaqs] = useState<AssistantFaq[]>([])

  const [trainMode, setTrainMode] = useState<TrainMode>('user')
  const [aiStarted, setAiStarted] = useState(false)
  const [aiPhase, setAiPhase] = useState<AiPhase>('idle')
  const [gaps, setGaps] = useState<Array<{ question: string; count: number }>>([])
  const [gapIndex, setGapIndex] = useState(0)
  const [scans, setScans] = useState<Array<{ title: string; reason: string }>>([])
  const [scanIndex, setScanIndex] = useState(0)

  const [correcting, setCorrecting] = useState(false)
  const [correction, setCorrection] = useState<{ question: string; answer: string; kind: 'faq' | 'knowledge' }>({
    question: '',
    answer: '',
    kind: 'faq',
  })
  const bodyRef = useRef<HTMLDivElement>(null)

  const refreshFaqs = useCallback(async () => {
    try {
      setFaqs(await fetchFaqs(assistantId))
    } catch {
      // 对齐记录为次要数据，失败静默
    }
  }, [assistantId])

  useEffect(() => {
    void refreshFaqs()
  }, [refreshFaqs])

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [messages, sending])

  const pushAssistant = (content: string, sources?: string[]) => {
    setMessages((prev) => [...prev, { role: 'assistant', content, sources }])
  }

  const lastUserContent = () => [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const lastAssistantContent = () => [...messages].reverse().find((m) => m.role === 'assistant')?.content ?? ''

  /* ---------- 用户说明模式 ---------- */
  const send = async (text?: string) => {
    const question = (text ?? input).trim()
    if (!question || sending) return
    setInput('')
    setSending(true)
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    let answer = ''
    let finished = false
    try {
      await streamTrainAnswer(assistantId, question, {
        onDelta: (delta) => {
          answer += delta
          setMessages((prev) => upsertAssistant(prev, answer))
        },
        onDone: (content, sources) => {
          finished = true
          answer = content
          setMessages((prev) => upsertAssistant(prev, content, sources))
        },
        onError: (errorMessage) => {
          finished = true
          setMessages((prev) => upsertAssistant(prev, `出错了：${errorMessage}`))
        },
      })
      if (!finished && answer) {
        setMessages((prev) => upsertAssistant(prev, answer))
      }
    } catch {
      setMessages((prev) => upsertAssistant(prev, '请求失败，请稍后再试'))
    } finally {
      setSending(false)
    }
  }

  /* ---------- AI 主动提问模式 ---------- */
  const askCurrentGap = (gap: { question: string; count: number }, index: number) => {
    pushAssistant(`【知识缺口 · 高优先级】${index + 1}/${gaps.length}：${gap.question}（×${gap.count} 次）。请补充标准答案。`)
  }

  const askCurrentScan = (issue: { title: string; reason: string }, index: number) => {
    pushAssistant(`【知识库扫描 · 低优先级】${index + 1}/${scans.length}：${issue.title}（${issue.reason}）。是否补充？`)
  }

  const finishAiCheck = () => {
    setAiPhase('done')
    pushAssistant('✅ 暂时没有发现需要完善的缺口，知识库相对完整。')
  }

  const moveToScan = () => {
    setAiPhase('scan')
    if (scans.length === 0) {
      finishAiCheck()
      return
    }
    askCurrentScan(scans[0], 0)
  }

  const advanceAi = () => {
    if (aiPhase === 'gap') {
      const next = gapIndex + 1
      if (next < gaps.length) {
        setGapIndex(next)
        askCurrentGap(gaps[next], next)
      } else {
        moveToScan()
      }
    } else if (aiPhase === 'scan') {
      const next = scanIndex + 1
      if (next < scans.length) {
        setScanIndex(next)
        askCurrentScan(scans[next], next)
      } else {
        finishAiCheck()
      }
    }
  }

  const startAiCheck = async () => {
    setAiStarted(true)
    pushAssistant('⚡ 已注入检查提示词：读取知识缺口（高优先）→ 扫描知识库（低优先）')
    try {
      const result = await runAiCheck(assistantId)
      setGaps(result.gaps)
      setGapIndex(0)
      setScans(result.scanIssues)
      setScanIndex(0)
      if (result.complete) {
        setAiPhase('gap')
        finishAiCheck()
        return
      }
      if (result.gaps.length > 0) {
        setAiPhase('gap')
        askCurrentGap(result.gaps[0], 0)
      } else {
        moveToScan()
      }
    } catch {
      pushAssistant('出错了：AI 检查失败，请稍后再试')
    }
  }

  const skipGap = () => moveToScan()
  const skipScan = () => advanceAi()

  const openCorrectionFor = (question: string, kind: 'faq' | 'knowledge') => {
    setCorrection({ question, answer: '', kind })
    setCorrecting(true)
  }

  const openCorrection = () => openCorrectionFor(lastUserContent(), 'faq')

  const sinkKnowledge = async () => {
    const question = lastUserContent()
    const answer = lastAssistantContent()
    if (!question || !answer) return
    try {
      await createFaq(assistantId, { question, answer, kind: 'knowledge' })
      await refreshFaqs()
      message.success('已沉淀为知识条目，立即生效')
    } catch {
      message.error('沉淀失败')
    }
  }

  const confirmCorrection = async () => {
    if (!correction.question.trim() || !correction.answer.trim()) {
      message.warning('问题和答案不能为空')
      return
    }
    try {
      await createFaq(assistantId, correction)
      setCorrecting(false)
      await refreshFaqs()
      message.success(`已保存为${correction.kind === 'faq' ? '固定话术' : '知识条目'}，立即生效`)
      if (trainMode === 'ai') {
        advanceAi()
      }
    } catch {
      message.error('保存失败')
    }
  }

  const undoFaq = async (faqId: number) => {
    try {
      await deleteFaq(assistantId, faqId)
      await refreshFaqs()
      message.success('已撤销该条对齐')
    } catch {
      message.error('撤销失败')
    }
  }

  /* ---------- 模式切换与动态快捷项 ---------- */
  const switchMode = (mode: TrainMode) => {
    setTrainMode(mode)
    if (mode === 'ai' && !aiStarted) {
      pushAssistant('开启后我会先读取知识缺口（高优先级），再扫描知识库内容判断是否完善（低优先级）；若已完善会直接告诉你。')
    }
  }

  const renderChips = () => {
    if (trainMode === 'user') {
      const chips = quickQuestions.length > 0 ? quickQuestions : ['试用版能用多久？', '私有化部署最低要几台机器？']
      return chips.map((q) => (
        <button key={q} type="button" className="visitor-chip" disabled={sending} onClick={() => void send(q)}>
          {q}
        </button>
      ))
    }
    if (!aiStarted) {
      return (
        <button type="button" className="visitor-chip" onClick={() => void startAiCheck()}>
          ⚡ 注入提示词并开始检查
        </button>
      )
    }
    if (aiPhase === 'gap') {
      return (
        <>
          <button type="button" className="visitor-chip" onClick={() => openCorrectionFor(gaps[gapIndex]?.question ?? '', 'faq')}>
            ✏️ 补充标准答案
          </button>
          <button type="button" className="visitor-chip" onClick={skipGap}>
            跳过缺口
          </button>
        </>
      )
    }
    if (aiPhase === 'scan') {
      return (
        <>
          <button type="button" className="visitor-chip" onClick={() => openCorrectionFor(scans[scanIndex]?.title ?? '', 'knowledge')}>
            ✏️ 补充这个点
          </button>
          <button type="button" className="visitor-chip" onClick={skipScan}>
            跳过
          </button>
          <button type="button" className="visitor-chip" onClick={finishAiCheck}>
            扫描结果已完善
          </button>
        </>
      )
    }
    return null
  }

  const placeholder = trainMode === 'ai' ? 'AI 在主导检查，可点击上方快捷操作…' : '向助手提问，或输入要沉淀的内容…'

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Segmented
        block
        value={trainMode}
        onChange={(value) => switchMode(value as TrainMode)}
        options={[
          { label: '用户说明', value: 'user' },
          { label: 'AI 主动提问', value: 'ai' },
        ]}
      />

      <Card size="small" className="train-chat-card">
        <div className="train-chat-body" ref={bodyRef}>
          {messages.length === 0 ? (
            <div className="train-hint">
              直接提问或纠正回答；回答下方可「纠正回答」（沉淀为固定话术/知识条目）或「沉淀为知识」，立即生效。切换到「AI 主动提问」可让助手基于缺口与知识扫描主动找你补齐。
            </div>
          ) : null}
          {messages.map((msg, index) => (
            <div key={index} className={`visitor-msg visitor-msg--${msg.role}`}>
              <div className="visitor-msg-bubble">
                <span>{msg.content}</span>
                {msg.sources && msg.sources.length > 0 ? (
                  <span className="visitor-msg-sources">📎 引用：{msg.sources.join('、')}</span>
                ) : null}
                {trainMode === 'user' && msg.role === 'assistant' && index === messages.length - 1 && !sending ? (
                  <span className="train-actions">
                    <Button size="small" onClick={openCorrection}>
                      ✏️ 纠正回答
                    </Button>
                    <Button size="small" onClick={() => void sinkKnowledge()}>
                      📌 沉淀为知识
                    </Button>
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          {sending ? (
            <div className="visitor-msg visitor-msg--assistant">
              <div className="visitor-msg-bubble">…</div>
            </div>
          ) : null}
        </div>
        {renderChips() ? <div className="visitor-quick">{renderChips()}</div> : null}
        <div className="visitor-input-row">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={() => void send()}
            placeholder={placeholder}
            disabled={sending || trainMode === 'ai'}
          />
          <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => void send()}>
            发送
          </Button>
        </div>
      </Card>

      <Card size="small" title={`对齐记录（${faqs.length}）`}>
        {faqs.length === 0 ? (
          <Typography.Text type="secondary">还没有对齐记录。问一个问题，然后点「纠正回答」体验闭环。</Typography.Text>
        ) : (
          faqs.map((faq) => (
            <div key={faq.id} className="train-align-row">
              <Space direction="vertical" size={2} style={{ flex: 1, minWidth: 0 }}>
                <Space size={6}>
                  <Tag color={faq.kind === 'faq' ? 'cyan' : 'green'}>{faq.kind === 'faq' ? '固定话术' : '知识条目'}</Tag>
                  <Tag color="success">已生效</Tag>
                </Space>
                <Typography.Text strong ellipsis>{faq.question}</Typography.Text>
                <Typography.Text type="secondary" ellipsis>{faq.answer}</Typography.Text>
              </Space>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                title="撤销"
                onClick={() => void undoFaq(faq.id)}
              />
            </div>
          ))
        )}
      </Card>

      <Modal
        title={trainMode === 'ai' ? (aiPhase === 'scan' ? '补充知识条目' : '补充标准答案') : '纠正回答（对齐）'}
        open={correcting}
        onCancel={() => setCorrecting(false)}
        onOk={() => void confirmCorrection()}
        okText="保存并生效"
        cancelText="取消"
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Typography.Text type="secondary">问题</Typography.Text>
            <Input
              value={correction.question}
              onChange={(e) => setCorrection((c) => ({ ...c, question: e.target.value }))}
            />
          </div>
          <div>
            <Typography.Text type="secondary">你的纠正 / 标准答案</Typography.Text>
            <Input.TextArea
              rows={4}
              value={correction.answer}
              onChange={(e) => setCorrection((c) => ({ ...c, answer: e.target.value }))}
              placeholder={trainMode === 'ai' ? '请输入标准答案，保存后立即生效…' : '例如：试用版时长调整为 21 天…'}
            />
          </div>
          {trainMode !== 'ai' ? (
            <div>
              <Typography.Text type="secondary">沉淀到</Typography.Text>
              <Segmented
                block
                value={correction.kind}
                onChange={(value) => setCorrection((c) => ({ ...c, kind: value as 'faq' | 'knowledge' }))}
                options={[
                  { label: '固定话术', value: 'faq' },
                  { label: '知识条目', value: 'knowledge' },
                ]}
                style={{ marginTop: 6 }}
              />
            </div>
          ) : null}
        </Space>
      </Modal>
    </Space>
  )
}
