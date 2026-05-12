import { StateStore } from '../../store/state-store.js'
import { TaskQueue } from '../../core/task-queue.js'
import { RateLimitDetector } from '../../core/rate-limit-detector.js'
import { DEFAULT_CONFIG } from '../../types/config.js'

export interface ResumeOptions {
  readonly dataDir: string
}

export async function resumeCommand(taskId: string | undefined, options: ResumeOptions): Promise<void> {
  const store = new StateStore(options.dataDir)
  const queue = new TaskQueue(store)
  const detector = new RateLimitDetector(store, DEFAULT_CONFIG)

  if (taskId) {
    const tasks = await queue.getAll()
    const task = tasks.find((t) => t.id === taskId || t.id.startsWith(taskId))

    if (!task) {
      console.error(`Task not found: ${taskId}`)
      process.exitCode = 1
      return
    }

    if (task.status !== 'paused' && task.status !== 'rate_limited') {
      console.log(`Task ${task.id.substring(0, 8)} is not paused or rate-limited (status: ${task.status}).`)
      return
    }

    await queue.updateTask(task.id, { status: 'pending' })
    console.log(`Task ${task.id.substring(0, 8)} resumed (set to pending).`)
  } else {
    await detector.clearRateLimit()

    const pausedTasks = await queue.getByStatus('paused')
    const rateLimitedTasks = await queue.getByStatus('rate_limited')
    const allSuspended = [...pausedTasks, ...rateLimitedTasks]

    for (const task of allSuspended) {
      await queue.updateTask(task.id, { status: 'pending' })
    }

    console.log(`Resumed ${allSuspended.length} task(s) and cleared rate limit state.`)
  }
}
