import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { StateStore } from '../../store/state-store.js'
import { TaskQueue } from '../../core/task-queue.js'

export interface AddOptions {
  readonly cwd: string
  readonly priority: string
  readonly dataDir: string
}

export async function addCommand(prompt: string, options: AddOptions): Promise<void> {
  const cwd = resolve(options.cwd)
  if (!existsSync(cwd)) {
    console.error(`Error: cwd does not exist: ${cwd}`)
    process.exitCode = 1
    return
  }

  const store = new StateStore(options.dataDir)
  const queue = new TaskQueue(store)

  const task = await queue.add({
    prompt,
    cwd,
    priority: parseInt(options.priority, 10),
  })

  console.log(`Task added: ${task.id}`)
  console.log(`  Prompt: ${task.prompt}`)
  console.log(`  CWD: ${task.cwd}`)
  console.log(`  Priority: ${task.priority}`)
}
