import { StateStore } from '../../store/state-store.js'
import { TaskQueue } from '../../core/task-queue.js'

export interface PauseOptions {
  readonly dataDir: string
}

export async function pauseCommand(taskId: string, options: PauseOptions): Promise<void> {
  const store = new StateStore(options.dataDir)
  const queue = new TaskQueue(store)

  const tasks = await queue.getAll()
  const task = tasks.find((t) => t.id === taskId || t.id.startsWith(taskId))

  if (!task) {
    console.error(`Task not found: ${taskId}`)
    process.exitCode = 1
    return
  }

  if (task.status === 'paused') {
    console.log(`Task ${task.id.substring(0, 8)} is already paused.`)
    return
  }

  await queue.updateTask(task.id, { status: 'paused' })
  console.log(`Task ${task.id.substring(0, 8)} paused.`)
}
