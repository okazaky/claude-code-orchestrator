import { describe, it, expect } from 'vitest'
import { nowISO, addMs, msUntil, isPast, formatDuration } from '../../src/utils/time.js'

describe('time utils', () => {
  it('nowISO returns valid ISO string', () => {
    const result = nowISO()
    expect(() => new Date(result).toISOString()).not.toThrow()
  })

  it('addMs adds milliseconds to ISO date', () => {
    const base = '2025-01-01T00:00:00.000Z'
    const result = addMs(base, 60_000)
    expect(result).toBe('2025-01-01T00:01:00.000Z')
  })

  it('msUntil returns ms until future date', () => {
    const future = new Date(Date.now() + 5000).toISOString()
    const ms = msUntil(future)
    expect(ms).toBeGreaterThan(4000)
    expect(ms).toBeLessThanOrEqual(5100)
  })

  it('msUntil returns 0 for past dates', () => {
    const past = '2020-01-01T00:00:00.000Z'
    expect(msUntil(past)).toBe(0)
  })

  it('isPast returns true for past dates', () => {
    expect(isPast('2020-01-01T00:00:00.000Z')).toBe(true)
  })

  it('isPast returns false for future dates', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(isPast(future)).toBe(false)
  })

  it('formatDuration formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms')
    expect(formatDuration(5000)).toBe('5s')
    expect(formatDuration(65000)).toBe('1m 5s')
    expect(formatDuration(3600000)).toBe('1h')
    expect(formatDuration(5400000)).toBe('1h 30m')
  })
})
