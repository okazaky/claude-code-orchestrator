import type { RateLimitEvent, RateLimitState } from '../types/index.js'
import type { OrchestratorConfig } from '../types/config.js'
import { StateStore } from '../store/state-store.js'
import { nowISO, addMs } from '../utils/time.js'
import { logger } from '../utils/logger.js'

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /usage.?limit/i,
  /too many requests/i,
  /429/,
  /throttl/i,
  /quota.?exceeded/i,
  /overloaded/i,
  /capacity/i,
]

const RESET_TIME_PATTERNS = [
  /resets?\s+(?:at|in)\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i,
  /try\s+again\s+(?:in|after)\s+(\d+)\s*(second|minute|hour)s?/i,
  /retry.?after:\s*(\d+)/i,
]

export interface DetectionResult {
  readonly isRateLimited: boolean
  readonly resetAt: string | null
  readonly rawMessage: string
}

export function detectRateLimit(message: string): DetectionResult {
  const matched = RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message))
  if (!matched) {
    return { isRateLimited: false, resetAt: null, rawMessage: message }
  }

  const resetAt = parseResetTime(message)
  return { isRateLimited: true, resetAt, rawMessage: message }
}

function parseResetTime(message: string): string | null {
  for (const pattern of RESET_TIME_PATTERNS) {
    const match = pattern.exec(message)
    if (!match) continue

    if (pattern.source.includes('retry.?after')) {
      const seconds = parseInt(match[1], 10)
      if (!isNaN(seconds)) {
        return addMs(nowISO(), seconds * 1000)
      }
    }

    if (pattern.source.includes('try\\s+again')) {
      const value = parseInt(match[1], 10)
      const unit = match[2].toLowerCase()
      if (!isNaN(value)) {
        const multiplier =
          unit.startsWith('hour') ? 3_600_000 :
          unit.startsWith('minute') ? 60_000 :
          1_000
        return addMs(nowISO(), value * multiplier)
      }
    }
  }

  return null
}

export function calculateBackoff(
  attemptNumber: number,
  config: Pick<OrchestratorConfig, 'initialBackoffMs' | 'maxBackoffMs' | 'backoffMultiplier'>,
): number {
  const backoff = config.initialBackoffMs * Math.pow(config.backoffMultiplier, attemptNumber)
  return Math.min(backoff, config.maxBackoffMs)
}

export class RateLimitDetector {
  constructor(
    private readonly store: StateStore,
    private readonly config: Pick<OrchestratorConfig, 'initialBackoffMs' | 'maxBackoffMs' | 'backoffMultiplier'>,
  ) {}

  async handleMessage(message: string, taskId: string): Promise<DetectionResult> {
    const result = detectRateLimit(message)
    if (!result.isRateLimited) return result

    logger.warn(`Rate limit detected for task ${taskId}: ${message}`)

    const state = await this.store.load()
    const attemptNumber = state.rateLimits.events.filter((e) => e.taskId === taskId).length
    const backoffMs = calculateBackoff(attemptNumber, this.config)
    const resumeAt = result.resetAt ?? addMs(nowISO(), backoffMs)

    const event: RateLimitEvent = {
      detectedAt: nowISO(),
      taskId,
      resetAt: result.resetAt,
      rawMessage: message,
      backoffMs,
      attemptNumber,
    }

    await this.store.update((s) => ({
      ...s,
      rateLimits: {
        isLimited: true,
        events: [...s.rateLimits.events, event],
        currentBackoffMs: backoffMs,
        resumeAt,
      },
    }))

    return result
  }

  async clearRateLimit(): Promise<void> {
    await this.store.update((s) => ({
      ...s,
      rateLimits: {
        ...s.rateLimits,
        isLimited: false,
        currentBackoffMs: 0,
        resumeAt: null,
      },
    }))
  }

  async getState(): Promise<RateLimitState> {
    const state = await this.store.load()
    return state.rateLimits
  }
}
