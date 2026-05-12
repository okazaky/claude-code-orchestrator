export type TaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'rate_limited'
  | 'completed'
  | 'failed'

export interface Task {
  readonly id: string
  readonly prompt: string
  readonly cwd: string
  readonly priority: number
  readonly createdAt: string
  readonly status: TaskStatus
  readonly sessionId: string | null
  readonly progressNote: string | null
  readonly lastError: string | null
  readonly attempts: number
  readonly updatedAt: string
}

export interface CreateTaskInput {
  readonly prompt: string
  readonly cwd: string
  readonly priority?: number
}
