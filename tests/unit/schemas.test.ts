import { describe, it, expect } from 'vitest'
import { taskSchema, rateLimitEventSchema, stateFileSchema, EMPTY_STATE } from '../../src/store/schemas.js'

describe('Zod schemas', () => {
  describe('taskSchema', () => {
    const validTask = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      prompt: 'do something',
      cwd: '/tmp',
      priority: 5,
      createdAt: '2025-01-01T00:00:00.000Z',
      status: 'pending',
      sessionId: null,
      progressNote: null,
      lastError: null,
      attempts: 0,
      updatedAt: '2025-01-01T00:00:00.000Z',
    }

    it('accepts valid task', () => {
      expect(() => taskSchema.parse(validTask)).not.toThrow()
    })

    it('rejects empty prompt', () => {
      expect(() => taskSchema.parse({ ...validTask, prompt: '' })).toThrow()
    })

    it('rejects invalid status', () => {
      expect(() => taskSchema.parse({ ...validTask, status: 'invalid' })).toThrow()
    })

    it('rejects priority out of range', () => {
      expect(() => taskSchema.parse({ ...validTask, priority: -1 })).toThrow()
      expect(() => taskSchema.parse({ ...validTask, priority: 101 })).toThrow()
    })

    it('rejects non-uuid id', () => {
      expect(() => taskSchema.parse({ ...validTask, id: 'not-a-uuid' })).toThrow()
    })
  })

  describe('rateLimitEventSchema', () => {
    it('accepts valid event', () => {
      const event = {
        detectedAt: '2025-01-01T00:00:00.000Z',
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        resetAt: null,
        rawMessage: 'rate limit exceeded',
        backoffMs: 60000,
        attemptNumber: 1,
      }
      expect(() => rateLimitEventSchema.parse(event)).not.toThrow()
    })
  })

  describe('stateFileSchema', () => {
    it('accepts empty state', () => {
      expect(() => stateFileSchema.parse(EMPTY_STATE)).not.toThrow()
    })
  })
})
