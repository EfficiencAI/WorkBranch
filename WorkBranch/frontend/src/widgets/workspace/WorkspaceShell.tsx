import { Col, Row } from 'antd'
import { WorkspaceCanvas } from './WorkspaceCanvas'
import { WorkspaceInspector } from './WorkspaceInspector'
import { WorkspaceSidebar } from './WorkspaceSidebar'

export function WorkspaceShell() {
  return (
    <Row gutter={[16, 16]} className="workspace-shell">
      <Col xs={24} lg={6}>
        <WorkspaceSidebar />
      </Col>
      <Col xs={24} lg={12}>
        <WorkspaceCanvas />
      </Col>
      <Col xs={24} lg={6}>
        <WorkspaceInspector />
      </Col>
    </Row>
  )
}
