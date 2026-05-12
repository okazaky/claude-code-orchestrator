import { StateStore } from '../../store/state-store.js'
import { TaskQueue } from '../../core/task-queue.js'

export interface ListOptions {
  readonly dataDir: string
}

const STATUS_ICONS: Record<string, string> = {
  pending: 'PEND',
  running: 'RUN ',
  paused: 'PAUS',
  rate_limited: 'WAIT',
  completed: 'DONE',
  failed: 'FAIL',
}

export async function listCommand(options: ListOptions): Promise<void> {
  const store = new StateStore(options.dataDir)
  const queue = new TaskQueue(store)
  const tasks = await queue.getAll()

  if (tasks.length === 0) {
    console.log('No tasks.')
    return
  }

  console.log(`${'ID'.padEnd(10)} ${'STATUS'.padEnd(6)} ${'PRI'.padEnd(4)} ${'PROMPT'.padEnd(50)} ${'ATTEMPTS'.padEnd(8)}`)
  console.log('-'.repeat(82))

  for (const task of tasks) {
    const id = task.id.substring(0, 8)
    const status = STATUS_ICONS[task.status] ?? task.status
    const prompt = task.prompt.length > 48 ? task.prompt.substring(0, 48) + '..' : task.prompt
    console.log(`${id.padEnd(10)} ${status.padEnd(6)} ${String(task.priority).padEnd(4)} ${prompt.padEnd(50)} ${String(task.attempts).padEnd(8)}`)
  }

  console.log(`\nTotal: ${tasks.length} task(s)`)
}
