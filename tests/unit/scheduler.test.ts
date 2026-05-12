import { describe, it, expect, afterEach } from 'vitest'
import { Scheduler } from '../../src/core/scheduler.js'
import { addMs, nowISO } from '../../src/utils/time.js'

describe('Scheduler', () => {
  let scheduler: Scheduler

  afterEach(() => {
    scheduler?.cancel()
  })

  it('waitMs resolves after delay', async () => {
    scheduler = new Scheduler()
    const start = Date.now()
    const result = await scheduler.waitMs(50)
    const elapsed = Date.now() - start
    expect(result).toBe(true)
    expect(elapsed).toBeGreaterThanOrEqual(40)
  })

  it('waitMs returns false when cancelled', async () => {
    scheduler = new Scheduler()
    const promise = scheduler.waitMs(5000)
    // Small delay to ensure timer is set up before cancel
    await new Promise((r) => setTimeout(r, 10))
    scheduler.cancel()
    const result = await promise
    expect(result).toBe(false)
  })

  it('waitMs returns false when signal is aborted', async () => {
    scheduler = new Scheduler()
    const ac = new AbortController()
    const promise = scheduler.waitMs(5000, ac.signal)
    ac.abort()
    const result = await promise
    expect(result).toBe(false)
  })

  it('waitUntil resolves immediately for past dates', async () => {
    scheduler = new Scheduler()
    const result = await scheduler.waitUntil('2020-01-01T00:00:00.000Z')
    expect(result).toBe(true)
  })

  it('waitUntil waits for future dates', async () => {
    scheduler = new Scheduler()
    const future = addMs(nowISO(), 50)
    const start = Date.now()
    const result = await scheduler.waitUntil(future)
    const elapsed = Date.now() - start
    expect(result).toBe(true)
    expect(elapsed).toBeGreaterThanOrEqual(30)
  })

  it('reset allows reuse after cancel', async () => {
    scheduler = new Scheduler()
    scheduler.cancel()
    scheduler.reset()
    const result = await scheduler.waitMs(10)
    expect(result).toBe(true)
  })
})
