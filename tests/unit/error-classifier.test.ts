import { describe, it, expect } from 'vitest'
import { isNonRetryableError } from '../../src/core/error-classifier.js'

describe('isNonRetryableError', () => {
  it('returns true for ENOENT', () => {
    expect(isNonRetryableError('Failed to spawn Claude Code process: spawn node ENOENT')).toBe(true)
  })

  it('returns true for EACCES', () => {
    expect(isNonRetryableError('EACCES: permission denied, open /root/secret')).toBe(true)
  })

  it('returns true for EPERM', () => {
    expect(isNonRetryableError('EPERM: operation not permitted')).toBe(true)
  })

  it('returns true for "not found at"', () => {
    expect(isNonRetryableError('Claude Code native binary not found at /usr/bin/claude')).toBe(true)
  })

  it('returns true for Permission denied', () => {
    expect(isNonRetryableError('Permission denied: /etc/shadow')).toBe(true)
  })

  it('returns true for No such file or directory', () => {
    expect(isNonRetryableError('No such file or directory: /nonexistent/path')).toBe(true)
  })

  it('returns true for Cannot find module', () => {
    expect(isNonRetryableError("Cannot find module '@anthropic-ai/claude-code'")).toBe(true)
  })

  it('returns false for rate limit errors', () => {
    expect(isNonRetryableError('Rate limit exceeded. Try again in 5 minutes.')).toBe(false)
  })

  it('returns false for network errors', () => {
    expect(isNonRetryableError('Network connection failed')).toBe(false)
  })

  it('returns false for generic errors', () => {
    expect(isNonRetryableError('Something went wrong')).toBe(false)
  })
})
