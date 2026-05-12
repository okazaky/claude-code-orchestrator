import { StateStore } from '../../store/state-store.js'
import { TaskQueue } from '../../core/task-queue.js'

export interface StopOptions {
  readonly dataDir: string
}

export async function stopCommand(options: StopOptions): Promise<void> {
  const store = new StateStore(options.dataDir)
  const queue = new TaskQueue(store)

  const runningTasks = await queue.getByStatus('running')
  for (const task of runningTasks) {
    await queue.updateTask(task.id, { status: 'paused' })
  }

  console.log(`Marked ${runningTasks.length} running task(s) as paused.`)
  console.log('Note: To stop a running orchestrator process, send SIGINT (Ctrl+C).')
}
