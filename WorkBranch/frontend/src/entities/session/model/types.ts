export type SessionId = string

export interface SessionSummary {
  id: SessionId
  title: string
  status?: string
  updatedAt?: string
}

export interface SessionDetail extends SessionSummary {
  createdAt?: string
}
