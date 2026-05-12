import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { StateStore } from '../../src/store/state-store.js'
import { EMPTY_STATE, type StateFile } from '../../src/store/schemas.js'

describe('StateStore', () => {
  let tmpDir: string
  let store: StateStore

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cco-test-'))
    store = new StateStore(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('returns empty state when no file exists', async () => {
    const state = await store.load()
    expect(state).toEqual(EMPTY_STATE)
  })

  it('saves and loads state correctly', async () => {
    const state: StateFile = {
      ...EMPTY_STATE,
      tasks: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          prompt: 'test prompt',
          cwd: '/tmp',
          priority: 5,
          createdAt: '2025-01-01T00:00:00.000Z',
          status: 'pending',
          sessionId: null,
          progressNote: null,
          lastError: null,
          attempts: 0,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
    }
    await store.save(state)
    const loaded = await store.load()
    expect(loaded).toEqual(state)
  })

  it('performs atomic update via update()', async () => {
    const result = await store.update((state) => ({
      ...state,
      tasks: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          prompt: 'updated',
          cwd: '/tmp',
          priority: 1,
          createdAt: '2025-01-01T00:00:00.000Z',
          status: 'pending',
          sessionId: null,
          progressNote: null,
          lastError: null,
          attempts: 0,
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
    }))
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].prompt).toBe('updated')

    const loaded = await store.load()
    expect(loaded.tasks[0].prompt).toBe('updated')
  })

  it('rejects invalid state on save', async () => {
    const badState = { tasks: 'not-an-array', rateLimits: {}, version: 1 }
    await expect(store.save(badState as unknown as StateFile)).rejects.toThrow()
  })

  it('returns empty state when file is corrupted', async () => {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(join(tmpDir, 'state.json'), 'not-json', 'utf-8')
    const state = await store.load()
    expect(state).toEqual(EMPTY_STATE)
  })
})
