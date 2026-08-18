import { Button } from 'antd'
import { FullscreenExitOutlined, PlusOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'

export type CanvasGuideStep = 'idle' | 'nudge' | 'pan' | 'move' | 'create' | 'focus' | 'complete'

type CanvasGuideProps = {
  step: CanvasGuideStep
  isMobile: boolean
  onStepChange: (step: CanvasGuideStep) => void
}

type Point = { x: number; y: number }

const STEP_COPY: Record<
  Exclude<CanvasGuideStep, 'idle' | 'nudge' | 'complete'>,
  { count: string; title: string; desktop: string; mobile: string }
> = {
  pan: {
    count: '1 / 4',
    title: '移动画布',
    desktop: '按住画布空白处拖动，网格和节点会一起移动。',
    mobile: '按住画布空白处拖动，网格和节点会一起移动。',
  },
  move: {
    count: '2 / 4',
    title: '调整节点位置',
    desktop: '拖动节点到你想放的位置，位置会自动保存；新分支会自动排列，无需手动留空。',
    mobile: '拖动节点到你想放的位置，位置会自动保存；新分支会自动排列，无需手动留空。',
  },
  create: {
    count: '3 / 4',
    title: '创建子对话',
    desktop: '右键节点选择“创建子对话”，新分支会自动分配到画布上。',
    mobile: '长按节点选择“创建子对话”，新分支会自动分配到画布上。',
  },
  focus: {
    count: '4 / 4',
    title: '进入聚焦',
    desktop: '点击节点进入聚焦，查看完整对话。',
    mobile: '轻点节点进入聚焦，查看完整对话。',
  },
}

const NEXT_STEP: Record<Exclude<CanvasGuideStep, 'idle' | 'nudge' | 'complete'>, CanvasGuideStep> = {
  pan: 'move',
  move: 'create',
  create: 'focus',
  focus: 'complete',
}

function RouteMark() {
  return <span className="canvas-guide__route-mark" aria-hidden="true" />
}

export function CanvasGuide({ step, isMobile, onStepChange }: CanvasGuideProps) {
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 })
  const [nodeOffset, setNodeOffset] = useState<Point>({ x: 0, y: 0 })
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const panStartRef = useRef<(Point & { origin: Point; pointerId: number }) | null>(null)
  const nodeStartRef = useRef<(Point & { origin: Point; pointerId: number }) | null>(null)
  const longPressTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (step === 'idle') return
    const frame = window.requestAnimationFrame(() => {
      setPanOffset({ x: 0, y: 0 })
      setNodeOffset({ x: 0, y: 0 })
      setContextMenuOpen(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [step])

  useEffect(() => () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
    }
  }, [])

  function clearLongPress() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  function handleSurfacePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (step !== 'pan' || (event.target as Element).closest('.canvas-guide__node')) return
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      origin: panOffset,
      pointerId: event.pointerId,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.classList.add('is-dragging')
  }

  function handleSurfacePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = panStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    setPanOffset({
      x: start.origin.x + event.clientX - start.x,
      y: start.origin.y + event.clientY - start.y,
    })
  }

  function handleSurfacePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = panStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    panStartRef.current = null
    event.currentTarget.classList.remove('is-dragging')
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 20) {
      onStepChange('move')
    }
  }

  function handleNodePointerDown(event: ReactPointerEvent<HTMLElement>) {
    event.stopPropagation()
    if (step === 'move') {
      nodeStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        origin: nodeOffset,
        pointerId: event.pointerId,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.classList.add('is-dragging')
      return
    }

    if (step === 'create' && isMobile) {
      clearLongPress()
      longPressTimerRef.current = window.setTimeout(() => {
        setContextMenuOpen(true)
        longPressTimerRef.current = null
      }, 520)
    }
  }

  function handleNodePointerMove(event: ReactPointerEvent<HTMLElement>) {
    clearLongPress()
    const start = nodeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    setNodeOffset({
      x: start.origin.x + event.clientX - start.x,
      y: start.origin.y + event.clientY - start.y,
    })
  }

  function handleNodePointerUp(event: ReactPointerEvent<HTMLElement>) {
    clearLongPress()
    const start = nodeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    nodeStartRef.current = null
    event.currentTarget.classList.remove('is-dragging')
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 18) {
      onStepChange('create')
    }
  }

  function handleNodeContextMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (step === 'create' && !isMobile) {
      setContextMenuOpen(true)
    }
  }

  const isRunning = step !== 'idle' && step !== 'nudge'
  const hasTemporaryNode = step === 'focus' || step === 'complete'
  const stepCopy = step === 'pan' || step === 'move' || step === 'create' || step === 'focus'
    ? STEP_COPY[step]
    : null
  const worldStyle = {
    '--canvas-guide-pan-x': `${panOffset.x}px`,
    '--canvas-guide-pan-y': `${panOffset.y}px`,
  } as CSSProperties
  const nodeStyle = {
    '--canvas-guide-node-x': `${nodeOffset.x}px`,
    '--canvas-guide-node-y': `${nodeOffset.y}px`,
  } as CSSProperties

  return (
    <>
      {step === 'nudge' ? (
        <aside className="canvas-guide__nudge" role="dialog" aria-label="画布新手引导">
          <div className="canvas-guide__kicker">
            <span><RouteMark />画布引导</span>
            <span>约 1 分钟</span>
          </div>
          <h2>第一次使用画布？</h2>
          <p>跟着完成四个动作。以后也能随时从 WB 下方的问号按钮重新开始。</p>
          <div className="canvas-guide__actions">
            <Button onClick={() => onStepChange('idle')}>跳过</Button>
            <Button type="primary" onClick={() => onStepChange('pan')}>开始引导</Button>
          </div>
        </aside>
      ) : null}

      {isRunning ? (
        <section
          className={`canvas-guide__overlay canvas-guide__overlay--${step}`}
          role="dialog"
          aria-modal="true"
          aria-label="画布操作引导"
        >
          {step !== 'complete' ? (
            <>
              <div
                className="canvas-guide__surface"
                onPointerDown={handleSurfacePointerDown}
                onPointerMove={handleSurfacePointerMove}
                onPointerUp={handleSurfacePointerUp}
                onPointerCancel={handleSurfacePointerUp}
              >
                <div className="canvas-guide__world" style={worldStyle}>
                  <span className={`canvas-guide__edge ${hasTemporaryNode ? 'is-visible' : ''}`} />
                  <article
                    className={`canvas-guide__node canvas-guide__node--root ${step === 'move' || step === 'create' ? 'is-target' : ''}`}
                    style={nodeStyle}
                    onPointerDown={handleNodePointerDown}
                    onPointerMove={handleNodePointerMove}
                    onPointerUp={handleNodePointerUp}
                    onPointerCancel={handleNodePointerUp}
                    onContextMenu={handleNodeContextMenu}
                  >
                    <header>
                      <span><strong>产品规划</strong><small>guide-root</small></span>
                      <em>演示</em>
                    </header>
                    <div><small>用户问题</small><p>帮我整理下一阶段的功能优先级</p></div>
                    <footer><span>临时节点</span><span>根对话</span></footer>
                  </article>

                  <article
                    role="button"
                    tabIndex={0}
                    className={`canvas-guide__node canvas-guide__node--temporary ${hasTemporaryNode ? 'is-visible' : ''} ${step === 'focus' ? 'is-target' : ''}`}
                    onClick={() => {
                      if (step === 'focus') onStepChange('complete')
                    }}
                    onKeyDown={(event) => {
                      if (step !== 'focus' || (event.key !== 'Enter' && event.key !== ' ')) return
                      event.preventDefault()
                      onStepChange('complete')
                    }}
                  >
                    <header>
                      <span><strong>临时演示节点</strong><small>guide-child</small></span>
                      <em>演示</em>
                    </header>
                    <div><small>引导任务</small><p>点击这个节点进入聚焦</p></div>
                    <footer><span>不保存</span><span>子对话</span></footer>
                  </article>
                </div>
              </div>

              {stepCopy ? (
                <aside className="canvas-guide__coach">
                  <div className="canvas-guide__kicker">
                    <span><RouteMark />{stepCopy.count}</span>
                    <span>等待操作</span>
                  </div>
                  <h2>{stepCopy.title}</h2>
                  <p>{isMobile ? stepCopy.mobile : stepCopy.desktop}</p>
                  <div className="canvas-guide__actions">
                    <Button onClick={() => onStepChange('idle')}>退出引导</Button>
                    <Button type="text" onClick={() => onStepChange(NEXT_STEP[step])}>跳过此步</Button>
                  </div>
                </aside>
              ) : null}

              <div className={`canvas-guide__gesture canvas-guide__gesture--${step}`} aria-hidden="true">
                {step === 'pan' ? (
                  <span className="glyph-chev"><span>⇦</span><span>⇦</span><span>⇦</span></span>
                ) : step === 'move' ? (
                  <span className="glyph-node" />
                ) : step === 'create' ? (
                  <span className="glyph-press" />
                ) : (
                  <span className="glyph-tap" />
                )}
                <span>{
                  step === 'pan'
                    ? isMobile ? '单指拖动画布' : '按住拖动画布'
                    : step === 'move'
                      ? '拖动节点调整位置'
                      : step === 'create'
                        ? isMobile ? '长按创建子对话' : '右键创建子对话'
                        : isMobile ? '轻点节点进入聚焦' : '点击节点进入聚焦'
                }</span>
              </div>

              {contextMenuOpen ? (
                <div className="canvas-guide__context-menu" role="menu">
                  <span className={'canvas-guide__menu-gesture'} aria-hidden={true}>
                    <span>↘</span>
                    <span>点击这里</span>
                  </span>
                  <Button
                    type="text"
                    className={'canvas-guide__context-target'}
                    icon={<PlusOutlined />}
                    role="menuitem"
                    onClick={() => {
                      setContextMenuOpen(false)
                      onStepChange('focus')
                    }}
                  >
                    创建子对话
                  </Button>
                  <Button type="text" role="menuitem">锁定为消息发送节点</Button>
                </div>
              ) : null}
            </>
          ) : (
            <div className="canvas-guide__focus-preview">
              <span className="canvas-guide__focus-title">临时演示节点 · 聚焦态</span>
              <Button
                type="text"
                className="canvas-guide__focus-exit"
                aria-label="退出聚焦"
                icon={<FullscreenExitOutlined />}
                onClick={() => onStepChange('idle')}
              />
              <div className="canvas-guide__thread">
                <p>如何把这条分支拆成可执行任务？</p>
                <p>可以先按依赖关系拆分，再为每项任务定义负责人和验收条件。</p>
              </div>
              <aside className="canvas-guide__coach canvas-guide__coach--complete">
                <div className="canvas-guide__kicker">
                  <span><RouteMark />4 / 4</span>
                  <span>已完成</span>
                </div>
                <h2>画布操作已就绪</h2>
                <p>演示节点会在结束引导后移除，不会写入当前会话。</p>
                <div className="canvas-guide__actions">
                  <Button onClick={() => onStepChange('pan')}>再看一次</Button>
                  <Button type="primary" onClick={() => onStepChange('idle')}>完成</Button>
                </div>
              </aside>
            </div>
          )}
        </section>
      ) : null}
    </>
  )
}
