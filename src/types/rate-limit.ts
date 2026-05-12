export interface RateLimitEvent {
  readonly detectedAt: string
  readonly taskId: string
  readonly resetAt: string | null
  readonly rawMessage: string
  readonly backoffMs: number
  readonly attemptNumber: number
}

export interface RateLimitState {
  readonly isLimited: boolean
  readonly events: readonly RateLimitEvent[]
  readonly currentBackoffMs: number
  readonly resumeAt: string | null
}
