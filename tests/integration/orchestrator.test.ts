import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Orchestrator } from '../../src/core/orchestrator.js'
import type { QueryFunction } from '../../src/core/session-manager.js'

function createSuccessQuery(result = 'Task done'): QueryFunction {
  return async function* () {
    yield {
      type: 'system',
      subtype: 'init',
      session_id: 'session-001',
      uuid: '00000000-0000-0000-0000-000000000001',
    }
    yield {
      type: 'result',
      subtype: 'success',
      session_id: 'session-001',
      uuid: '00000000-0000-0000-0000-000000000002',
      result,
      is_error: false,
      total_cost_usd: 0.03,
      num_turns: 2,
      duration_ms: 1000,
      duration_api_ms: 800,
      usage: {},
      modelUsage: {},
      permission_denials: [],
    }
  }
}

function createRateLimitQuery(): QueryFunction {
  return async function* () {
    yield {
      type: 'result',
      subtype: 'error_during_execution',
      session_id: 'session-rl',
      uuid: '00000000-0000-0000-0000-000000000001',
      result: 'Rate limit exceeded. Try again in 1 seconds.',
      is_error: true,
      total_cost_usd: 0.01,
      num_turns: 1,
      duration_ms: 200,
      duration_api_ms: 100,
      usage: {},
      modelUsage: {},
      permission_denials: [],
    }
  }
}

describe('Orchestrator', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cco-orch-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('processes a single task with --once', async () => {
    let completedId = ''
    const orch = new Orchestrator(createSuccessQuery(), { dataDir: tmpDir }, {
      onTaskComplete: (id, success) => {
        completedId = id
      },
    })

    const task = await orch.getQueue().add({ prompt: 'hello', cwd: '/tmp' })
    await orch.start({ once: true })

    const updated = await orch.getQueue().getById(task.id)
    expect(updated?.status).toBe('completed')
    expect(completedId).toBe(task.id)
  })

  it('stops gracefully when no tasks', async () => {
    const orch = new Orchestrator(createSuccessQuery(), { dataDir: tmpDir })
    await orch.start({ once: true })
    expect(orch.isRunning()).toBe(false)
  })

  it('handles rate limit and marks task as rate_limited', async () => {
    let rateLimitedId = ''
    const orch = new Orchestrator(createRateLimitQuery(), { dataDir: tmpDir }, {
      onRateLimited: (id) => {
        rateLimitedId = id
      },
    })

    const task = await orch.getQueue().add({ prompt: 'will be limited', cwd: '/tmp' })
    await orch.start({ once: true })

    const updated = await orch.getQueue().getById(task.id)
    expect(updated?.status).toBe('rate_limited')
    expect(rateLimitedId).toBe(task.id)
  })

  it('processes tasks in priority order', async () => {
    const completed: string[] = []
    let callCount = 0

    const queryFn: QueryFunction = async function* () {
      callCount++
      yield {
        type: 'result',
        subtype: 'success',
        session_id: `session-${callCount}`,
        uuid: '00000000-0000-0000-0000-000000000001',
        result: `result-${callCount}`,
        is_error: false,
        total_cost_usd: 0.01,
        num_turns: 1,
        duration_ms: 100,
        duration_api_ms: 80,
        usage: {},
        modelUsage: {},
        permission_denials: [],
      }
    }

    const orch = new Orchestrator(queryFn, { dataDir: tmpDir }, {
      onTaskComplete: (id) => completed.push(id),
    })

    const low = await orch.getQueue().add({ prompt: 'low', cwd: '/tmp', priority: 10 })
    const high = await orch.getQueue().add({ prompt: 'high', cwd: '/tmp', priority: 1 })

    // Run once for first task
    await orch.start({ once: true })
    // Run once more for second task
    await orch.start({ once: true })

    expect(completed[0]).toBe(high.id)
    expect(completed[1]).toBe(low.id)
  })

  it('retries failed tasks up to maxRetries', async () => {
    const queryFn: QueryFunction = async function* () {
      throw new Error('Transient network error')
    }

    const orch = new Orchestrator(queryFn, { dataDir: tmpDir, maxRetries: 2 })
    const task = await orch.getQueue().add({ prompt: 'will fail', cwd: '/tmp' })

    await orch.start({ once: true })
    let updated = await orch.getQueue().getById(task.id)
    expect(updated?.status).toBe('pending')
    expect(updated?.attempts).toBe(1)

    await orch.start({ once: true })
    updated = await orch.getQueue().getById(task.id)
    expect(updated?.status).toBe('failed')
    expect(updated?.attempts).toBe(2)
  })

  it('stop() halts the orchestrator', async () => {
    const orch = new Orchestrator(createSuccessQuery(), { dataDir: tmpDir })
    // Just verify stop doesn't throw when not running
    orch.stop()
    expect(orch.isRunning()).toBe(false)
  })
})
