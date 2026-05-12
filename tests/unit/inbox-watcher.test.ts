import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { existsSync } from 'node:fs'
import { StateStore } from '../../src/store/state-store.js'
import { TaskQueue } from '../../src/core/task-queue.js'
import { InboxWatcher } from '../../src/core/inbox-watcher.js'

describe('InboxWatcher', () => {
  let tmpDir: string
  let store: StateStore
  let queue: TaskQueue
  let watcher: InboxWatcher

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cco-inbox-'))
    store = new StateStore(tmpDir)
    queue = new TaskQueue(store)
    watcher = new InboxWatcher(tmpDir, queue)
  })

  it('returns 0 when inbox is empty', async () => {
    const added = await watcher.scan()
    expect(added).toBe(0)
  })

  it('picks up a plain text task file', async () => {
    const inboxDir = join(tmpDir, 'inbox')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(inboxDir, { recursive: true })
    await writeFile(join(inboxDir, 'task1.md'), 'Fix the login bug')

    const added = await watcher.scan()
    expect(added).toBe(1)

    const tasks = await queue.getAll()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].prompt).toBe('Fix the login bug')
    expect(tasks[0].priority).toBe(5)
  })

  it('parses frontmatter for cwd and priority', async () => {
    const inboxDir = join(tmpDir, 'inbox')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(inboxDir, { recursive: true })

    const content = `---
cwd: /tmp
priority: 1
---
Implement user authentication with JWT`

    await writeFile(join(inboxDir, 'auth.md'), content)

    const added = await watcher.scan()
    expect(added).toBe(1)

    const tasks = await queue.getAll()
    expect(tasks[0].prompt).toBe('Implement user authentication with JWT')
    expect(tasks[0].cwd).toBe('/tmp')
    expect(tasks[0].priority).toBe(1)
  })

  it('rejects task with non-existent cwd', async () => {
    const inboxDir = join(tmpDir, 'inbox')
    const processedDir = join(tmpDir, 'processed')
    const { mkdir, readdir } = await import('node:fs/promises')
    await mkdir(inboxDir, { recursive: true })

    const content = `---
cwd: /nonexistent/path/that/does/not/exist
---
This should be rejected`

    await writeFile(join(inboxDir, 'bad.md'), content)

    const added = await watcher.scan()
    expect(added).toBe(0)

    const tasks = await queue.getAll()
    expect(tasks).toHaveLength(0)

    const processed = await readdir(processedDir)
    expect(processed).toHaveLength(1)
    expect(processed[0]).toContain('INVALID_bad.md')
  })

  it('moves processed files to processed directory', async () => {
    const inboxDir = join(tmpDir, 'inbox')
    const processedDir = join(tmpDir, 'processed')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(inboxDir, { recursive: true })
    await writeFile(join(inboxDir, 'task.txt'), 'Do something')

    await watcher.scan()

    expect(existsSync(join(inboxDir, 'task.txt'))).toBe(false)
    expect(existsSync(processedDir)).toBe(true)

    const { readdir } = await import('node:fs/promises')
    const processed = await readdir(processedDir)
    expect(processed).toHaveLength(1)
    expect(processed[0]).toContain('task.txt')
  })

  it('ignores non .md/.txt files', async () => {
    const inboxDir = join(tmpDir, 'inbox')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(inboxDir, { recursive: true })
    await writeFile(join(inboxDir, 'notes.json'), '{"key": "value"}')
    await writeFile(join(inboxDir, 'script.sh'), 'echo hello')

    const added = await watcher.scan()
    expect(added).toBe(0)
  })

  it('processes multiple files in one scan', async () => {
    const inboxDir = join(tmpDir, 'inbox')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(inboxDir, { recursive: true })
    await writeFile(join(inboxDir, 'task1.md'), 'First task')
    await writeFile(join(inboxDir, 'task2.txt'), 'Second task')
    await writeFile(join(inboxDir, 'task3.md'), 'Third task')

    const added = await watcher.scan()
    expect(added).toBe(3)

    const tasks = await queue.getAll()
    expect(tasks).toHaveLength(3)
  })

  it('handles tilde in cwd as HOME', async () => {
    const inboxDir = join(tmpDir, 'inbox')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(inboxDir, { recursive: true })

    // Use ~ which expands to HOME — HOME always exists
    const content = `---
cwd: ~
---
Update README`

    await writeFile(join(inboxDir, 'readme.md'), content)

    await watcher.scan()

    const tasks = await queue.getAll()
    const home = process.env['HOME'] ?? '/tmp'
    expect(tasks[0].cwd).toBe(home)
  })
})
