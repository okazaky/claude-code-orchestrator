import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SessionManager, type QueryFunction } from '../../src/core/session-manager.js'
import { RateLimitDetector } from '../../src/core/rate-limit-detector.js'
import { StateStore } from '../../src/store/state-store.js'
import { DEFAULT_CONFIG } from '../../src/types/config.js'
import type { Task } from '../../src/types/index.js'

function makeTask(overrides?: Partial<Task>): Task {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    prompt: 'test task',
    cwd: '/tmp',
    priority: 5,
    createdAt: '2025-01-01T00:00:00.000Z',
    status: 'pending',
    sessionId: null,
    progressNote: null,
    lastError: null,
    attempts: 0,
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createMockQuery(messages: Record<string, unknown>[]): QueryFunction {
  return async function* () {
    for (const msg of messages) {
      yield msg
    }
  }
}

describe('SessionManager', () => {
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

  it('runs a successful task', async () => {
    const queryFn = createMockQuery([
      {
        type: 'system',
        subtype: 'init',
        session_id: 'session-abc',
        uuid: '00000000-0000-0000-0000-000000000001',
      },
      {
        type: 'result',
        subtype: 'success',
        session_id: 'session-abc',
        uuid: '00000000-0000-0000-0000-000000000002',
        result: 'Done!',
        is_error: false,
        total_cost_usd: 0.05,
        num_turns: 3,
        duration_ms: 1000,
        duration_api_ms: 800,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      },
    ])

    const manager = new SessionManager(queryFn, detector)
    const result = await manager.runTask(makeTask())

    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-abc')
    expect(result.resultText).toBe('Done!')
    expect(result.costUsd).toBe(0.05)
    expect(result.numTurns).toBe(3)
    expect(result.rateLimited).toBe(false)
  })

  it('detects rate limit in result message', async () => {
    const queryFn = createMockQuery([
      {
        type: 'system',
        subtype: 'init',
        session_id: 'session-abc',
        uuid: '00000000-0000-0000-0000-000000000001',
      },
      {
        type: 'result',
        subtype: 'error_during_execution',
        session_id: 'session-abc',
        uuid: '00000000-0000-0000-0000-000000000002',
        result: 'Error: rate limit exceeded. Try again in 5 minutes.',
        is_error: true,
        total_cost_usd: 0.01,
        num_turns: 1,
        duration_ms: 500,
        duration_api_ms: 400,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      },
    ])

    const manager = new SessionManager(queryFn, detector)
    const result = await manager.runTask(makeTask())

    expect(result.rateLimited).toBe(true)
    expect(result.success).toBe(false)
  })

  it('detects rate limit in thrown error', async () => {
    const queryFn: QueryFunction = async function* () {
      throw new Error('429 Too Many Requests')
    }

    const manager = new SessionManager(queryFn, detector)
    const result = await manager.runTask(makeTask())

    expect(result.rateLimited).toBe(true)
    expect(result.success).toBe(false)
  })

  it('handles non-rate-limit errors', async () => {
    const queryFn: QueryFunction = async function* () {
      throw new Error('Network connection failed')
    }

    const manager = new SessionManager(queryFn, detector)
    const result = await manager.runTask(makeTask())

    expect(result.rateLimited).toBe(false)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Network connection failed')
  })

  it('uses resume session when provided', async () => {
    let capturedPrompt = ''
    const queryFn: QueryFunction = async function* (params) {
      capturedPrompt = params.prompt as string
      yield {
        type: 'result',
        subtype: 'success',
        session_id: 'session-resumed',
        uuid: '00000000-0000-0000-0000-000000000001',
        result: 'Resumed!',
        is_error: false,
        total_cost_usd: 0.02,
        num_turns: 1,
        duration_ms: 500,
        duration_api_ms: 400,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      }
    }

    const manager = new SessionManager(queryFn, detector)
    const task = makeTask({ progressNote: 'Step 1 done' })
    const result = await manager.runTask(task, 'old-session-id')

    expect(result.success).toBe(true)
    expect(capturedPrompt).toContain('Continue from where you left off')
    expect(capturedPrompt).toContain('Step 1 done')
  })

  it('abort cancels the abort controller', async () => {
    let receivedAbortSignal = false
    const queryFn: QueryFunction = async function* (params) {
      const ac = params.options?.abortController as AbortController | undefined
      if (ac) {
        ac.signal.addEventListener('abort', () => {
          receivedAbortSignal = true
        })
      }
      yield {
        type: 'result',
        subtype: 'success',
        session_id: 'session-abc',
        uuid: '00000000-0000-0000-0000-000000000001',
        result: 'Done',
        is_error: false,
        total_cost_usd: 0,
        num_turns: 1,
        duration_ms: 100,
        duration_api_ms: 80,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      }
    }

    const manager = new SessionManager(queryFn, detector)

    // Start the task but abort before awaiting
    const taskPromise = manager.runTask(makeTask())
    manager.abort()

    const result = await taskPromise
    expect(receivedAbortSignal).toBe(true)
  })
})
