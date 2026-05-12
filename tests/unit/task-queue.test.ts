import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StateStore } from '../../src/store/state-store.js'
import { TaskQueue } from '../../src/core/task-queue.js'

describe('TaskQueue', () => {
  let tmpDir: string
  let store: StateStore
  let queue: TaskQueue

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cco-test-'))
    store = new StateStore(tmpDir)
    queue = new TaskQueue(store)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('adds a task with default priority', async () => {
    const task = await queue.add({ prompt: 'do something', cwd: '/tmp' })
    expect(task.prompt).toBe('do something')
    expect(task.cwd).toBe('/tmp')
    expect(task.priority).toBe(5)
    expect(task.status).toBe('pending')
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('adds a task with custom priority', async () => {
    const task = await queue.add({ prompt: 'urgent', cwd: '/tmp', priority: 1 })
    expect(task.priority).toBe(1)
  })

  it('returns all tasks', async () => {
    await queue.add({ prompt: 'task 1', cwd: '/tmp' })
    await queue.add({ prompt: 'task 2', cwd: '/tmp' })
    const tasks = await queue.getAll()
    expect(tasks).toHaveLength(2)
  })

  it('gets task by id', async () => {
    const task = await queue.add({ prompt: 'find me', cwd: '/tmp' })
    const found = await queue.getById(task.id)
    expect(found?.prompt).toBe('find me')
  })

  it('returns undefined for non-existent task', async () => {
    const found = await queue.getById('550e8400-e29b-41d4-a716-446655440099')
    expect(found).toBeUndefined()
  })

  it('gets next pending task sorted by priority then createdAt', async () => {
    await queue.add({ prompt: 'low priority', cwd: '/tmp', priority: 10 })
    await queue.add({ prompt: 'high priority', cwd: '/tmp', priority: 1 })
    await queue.add({ prompt: 'medium priority', cwd: '/tmp', priority: 5 })

    const next = await queue.getNextPending()
    expect(next?.prompt).toBe('high priority')
  })

  it('updates task fields', async () => {
    const task = await queue.add({ prompt: 'update me', cwd: '/tmp' })
    const updated = await queue.updateTask(task.id, {
      status: 'running',
      sessionId: 'session-123',
    })
    expect(updated?.status).toBe('running')
    expect(updated?.sessionId).toBe('session-123')
  })

  it('clears completed and failed tasks', async () => {
    const t1 = await queue.add({ prompt: 'done', cwd: '/tmp' })
    const t2 = await queue.add({ prompt: 'failed', cwd: '/tmp' })
    const t3 = await queue.add({ prompt: 'pending', cwd: '/tmp' })

    await queue.updateTask(t1.id, { status: 'completed' })
    await queue.updateTask(t2.id, { status: 'failed' })

    const cleared = await queue.clearCompleted()
    expect(cleared).toBe(2)

    const remaining = await queue.getAll()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(t3.id)
  })

  it('gets tasks by status', async () => {
    const t1 = await queue.add({ prompt: 'a', cwd: '/tmp' })
    await queue.add({ prompt: 'b', cwd: '/tmp' })
    await queue.updateTask(t1.id, { status: 'running' })

    const running = await queue.getByStatus('running')
    expect(running).toHaveLength(1)
    expect(running[0].id).toBe(t1.id)

    const pending = await queue.getByStatus('pending')
    expect(pending).toHaveLength(1)
  })
})
