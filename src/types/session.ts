export interface SessionInfo {
  readonly sessionId: string
  readonly taskId: string
  readonly startedAt: string
  readonly lastActivityAt: string
  readonly isActive: boolean
}
