import { Button, Space, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StatusTag } from '../../shared/ui'
import { ConversationCanvas } from './ConversationCanvas'
import { DetailPanel } from './DetailPanel'
import { SessionSidebar } from './SessionSidebar'
import { currentSessionDetail } from './workspaceMocks'

type SidebarMode = 'history' | 'settings'

export function WorkspaceShell() {
  const navigate = useNavigate()
  const [peekNav, setPeekNav] = useState(false)
  const [activeSidebar, setActiveSidebar] = useState<SidebarMode | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)

  function closeWorkspaceLayers() {
    setActiveSidebar(null)
    setFocusedNodeId(null)
  }

  function openSidebar(mode: SidebarMode) {
    setActiveSidebar(mode)
    setFocusedNodeId(null)
  }

  function focusNode(nodeId: string) {
    setFocusedNodeId(nodeId)
    setActiveSidebar(null)
  }

  return (
    <section className="workspace-shell">
      <div className="workspace-shell__canvas-layer">
        <ConversationCanvas focusedNodeId={focusedNodeId} onFocusNode={focusNode} />

        <div
          className="workspace-shell__nav"
          onMouseEnter={() => setPeekNav(true)}
          onMouseLeave={() => setPeekNav(false)}
        >
          <Button
            type="primary"
            shape="round"
            className="workspace-shell__nav-trigger"
            aria-label="展开工作台入口"
            aria-expanded={peekNav}
            onClick={() => setPeekNav((current) => !current)}
          >
            WB
          </Button>

          <div className={peekNav ? 'workspace-shell__nav-actions workspace-shell__nav-actions--visible' : 'workspace-shell__nav-actions'}>
            <Button className="workspace-shell__nav-button" onClick={closeWorkspaceLayers}>
              工作台
            </Button>
            <Button
              className={activeSidebar === 'history' ? 'workspace-shell__nav-button workspace-shell__nav-button--active' : 'workspace-shell__nav-button'}
              onClick={() => openSidebar('history')}
            >
              会话历史
            </Button>
            <Button
              className={activeSidebar === 'settings' ? 'workspace-shell__nav-button workspace-shell__nav-button--active' : 'workspace-shell__nav-button'}
              onClick={() => openSidebar('settings')}
            >
              设置
            </Button>
          </div>
        </div>

        <div className="workspace-shell__hud">
          <Space direction="vertical" size={8}>
            <Typography.Text className="workspace-shell__eyebrow">WorkBranch Workspace</Typography.Text>
            <Typography.Title level={3} className="workspace-shell__title">
              {currentSessionDetail.title}
            </Typography.Title>
            <Space wrap>
              <StatusTag label="阶段四" tone="processing" />
              <StatusTag label="全屏会话图" tone="success" />
              <StatusTag label="静态预览" tone="warning" />
            </Space>
          </Space>
        </div>
      </div>

      {activeSidebar ? (
        <button
          type="button"
          className="workspace-shell__scrim"
          aria-label="关闭覆盖侧边栏"
          onClick={() => setActiveSidebar(null)}
        />
      ) : null}

      {activeSidebar ? (
        <SessionSidebar
          mode={activeSidebar}
          onClose={() => setActiveSidebar(null)}
          onOpenSettingsPage={() => navigate('/settings')}
        />
      ) : null}

      {focusedNodeId ? (
        <button
          type="button"
          className="workspace-shell__scrim workspace-shell__scrim--detail"
          aria-label="关闭节点聚焦详情"
          onClick={() => setFocusedNodeId(null)}
        />
      ) : null}

      {focusedNodeId ? <DetailPanel nodeId={focusedNodeId} onClose={() => setFocusedNodeId(null)} /> : null}
    </section>
  )
}
