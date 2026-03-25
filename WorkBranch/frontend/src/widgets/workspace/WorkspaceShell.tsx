import { Col, Row } from 'antd'
import { ConversationCanvas } from './ConversationCanvas'
import { DetailPanel } from './DetailPanel'
import { SessionSidebar } from './SessionSidebar'

export function WorkspaceShell() {
  return (
    <Row gutter={[16, 16]} className="workspace-shell">
      <Col xs={24} xl={6}>
        <SessionSidebar />
      </Col>
      <Col xs={24} xl={12}>
        <ConversationCanvas />
      </Col>
      <Col xs={24} xl={6}>
        <DetailPanel />
      </Col>
    </Row>
  )
}
