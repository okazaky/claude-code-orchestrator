import { StateStore } from '../../store/state-store.js'
import { TaskQueue } from '../../core/task-queue.js'

export interface ClearOptions {
  readonly dataDir: string
}

export async function clearCommand(options: ClearOptions): Promise<void> {
  const store = new StateStore(options.dataDir)
  const queue = new TaskQueue(store)

  const cleared = await queue.clearCompleted()
  console.log(`Cleared ${cleared} completed/failed task(s).`)
}
