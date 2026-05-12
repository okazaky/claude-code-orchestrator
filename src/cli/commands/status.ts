import { StateStore } from '../../store/state-store.js'
import { TaskQueue } from '../../core/task-queue.js'
import { formatDuration, msUntil } from '../../utils/time.js'

export interface StatusOptions {
  readonly dataDir: string
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const store = new StateStore(options.dataDir)
  const queue = new TaskQueue(store)
  const state = await store.load()
  const tasks = await queue.getAll()

  const counts = {
    pending: tasks.filter((t) => t.status === 'pending').length,
    running: tasks.filter((t) => t.status === 'running').length,
    paused: tasks.filter((t) => t.status === 'paused').length,
    rate_limited: tasks.filter((t) => t.status === 'rate_limited').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
  }

  console.log('=== CCO Status ===')
  console.log(`Tasks: ${tasks.length} total`)
  console.log(`  Pending:      ${counts.pending}`)
  console.log(`  Running:      ${counts.running}`)
  console.log(`  Paused:       ${counts.paused}`)
  console.log(`  Rate Limited: ${counts.rate_limited}`)
  console.log(`  Completed:    ${counts.completed}`)
  console.log(`  Failed:       ${counts.failed}`)

  console.log('')
  console.log('=== Rate Limit ===')
  const rl = state.rateLimits
  console.log(`  Active: ${rl.isLimited ? 'YES' : 'No'}`)
  if (rl.resumeAt) {
    const remaining = msUntil(rl.resumeAt)
    console.log(`  Resume at: ${rl.resumeAt}`)
    console.log(`  Remaining: ${formatDuration(remaining)}`)
  }
  console.log(`  Total events: ${rl.events.length}`)
}
