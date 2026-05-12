export interface OrchestratorConfig {
  readonly dataDir: string
  readonly maxRetries: number
  readonly initialBackoffMs: number
  readonly maxBackoffMs: number
  readonly backoffMultiplier: number
  readonly maxConcurrent: number
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  dataDir: './data',
  maxRetries: 10,
  initialBackoffMs: 60_000,
  maxBackoffMs: 3_600_000,
  backoffMultiplier: 2,
  maxConcurrent: 1,
}
