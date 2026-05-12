import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectRateLimit, calculateBackoff, RateLimitDetector } from '../../src/core/rate-limit-detector.js'
import { StateStore } from '../../src/store/state-store.js'
import { DEFAULT_CONFIG } from '../../src/types/config.js'

describe('detectRateLimit', () => {
  it('detects "rate limit" pattern', () => {
    const result = detectRateLimit('Error: rate limit exceeded')
    expect(result.isRateLimited).toBe(true)
  })

  it('detects "429" pattern', () => {
    const result = detectRateLimit('HTTP 429 Too Many Requests')
    expect(result.isRateLimited).toBe(true)
  })

  it('detects "usage limit" pattern', () => {
    const result = detectRateLimit('Your usage limit has been reached')
    expect(result.isRateLimited).toBe(true)
  })

  it('detects "throttle" pattern', () => {
    const result = detectRateLimit('Request throttled')
    expect(result.isRateLimited).toBe(true)
  })

  it('detects "quota exceeded" pattern', () => {
    const result = detectRateLimit('API quota exceeded')
    expect(result.isRateLimited).toBe(true)
  })

  it('does not detect normal messages', () => {
    const result = detectRateLimit('Task completed successfully')
    expect(result.isRateLimited).toBe(false)
  })

  it('parses "try again in N minutes" reset time', () => {
    const result = detectRateLimit('Rate limit hit. Try again in 5 minutes.')
    expect(result.isRateLimited).toBe(true)
    expect(result.resetAt).not.toBeNull()
    if (result.resetAt) {
      const resetTime = new Date(result.resetAt).getTime()
      const now = Date.now()
      const diff = resetTime - now
      expect(diff).toBeGreaterThan(4 * 60_000)
      expect(diff).toBeLessThan(6 * 60_000)
    }
  })

  it('parses "try again in N seconds" reset time', () => {
    const result = detectRateLimit('Rate limit. Try again in 30 seconds.')
    expect(result.isRateLimited).toBe(true)
    expect(result.resetAt).not.toBeNull()
  })

  it('parses "retry-after: N" header', () => {
    const result = detectRateLimit('429 rate limit. retry-after: 60')
    expect(result.isRateLimited).toBe(true)
    expect(result.resetAt).not.toBeNull()
  })

  it('returns null resetAt when no time info present', () => {
    const result = detectRateLimit('Rate limit exceeded')
    expect(result.isRateLimited).toBe(true)
    expect(result.resetAt).toBeNull()
  })
})

describe('calculateBackoff', () => {
  const config = {
    initialBackoffMs: 60_000,
    maxBackoffMs: 3_600_000,
    backoffMultiplier: 2,
  }

  it('returns initialBackoffMs for attempt 0', () => {
    expect(calculateBackoff(0, config)).toBe(60_000)
  })

  it('doubles for each attempt', () => {
    expect(calculateBackoff(1, config)).toBe(120_000)
    expect(calculateBackoff(2, config)).toBe(240_000)
    expect(calculateBackoff(3, config)).toBe(480_000)
  })

  it('caps at maxBackoffMs', () => {
    expect(calculateBackoff(10, config)).toBe(3_600_000)
    expect(calculateBackoff(20, config)).toBe(3_600_000)
  })
})

describe('RateLimitDetector', () => {
  let tmpDir: string
  let store: StateStore
  let detector: RateLimitDetector

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cco-test-'))
    store = new StateStore(tmpDir)
    detector = new RateLimitDetector(store, DEFAULT_CONFIG)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('records rate limit event to state', async () => {
    const taskId = '550e8400-e29b-41d4-a716-446655440000'
    await detector.handleMessage('Rate limit exceeded', taskId)

    const state = await detector.getState()
    expect(state.isLimited).toBe(true)
    expect(state.events).toHaveLength(1)
    expect(state.events[0].taskId).toBe(taskId)
    expect(state.resumeAt).not.toBeNull()
  })

  it('clears rate limit state', async () => {
    const taskId = '550e8400-e29b-41d4-a716-446655440000'
    await detector.handleMessage('Rate limit exceeded', taskId)
    await detector.clearRateLimit()

    const state = await detector.getState()
    expect(state.isLimited).toBe(false)
    expect(state.resumeAt).toBeNull()
    expect(state.events).toHaveLength(1) // events are preserved
  })

  it('does not record non-rate-limit messages', async () => {
    const taskId = '550e8400-e29b-41d4-a716-446655440000'
    const result = await detector.handleMessage('All good', taskId)

    expect(result.isRateLimited).toBe(false)
    const state = await detector.getState()
    expect(state.isLimited).toBe(false)
    expect(state.events).toHaveLength(0)
  })

  it('increments backoff on repeated rate limits', async () => {
    const taskId = '550e8400-e29b-41d4-a716-446655440000'
    await detector.handleMessage('Rate limit exceeded', taskId)
    await detector.handleMessage('Rate limit exceeded', taskId)

    const state = await detector.getState()
    expect(state.events).toHaveLength(2)
    expect(state.currentBackoffMs).toBe(DEFAULT_CONFIG.initialBackoffMs * DEFAULT_CONFIG.backoffMultiplier)
  })
})
