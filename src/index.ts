#!/usr/bin/env node

import { Command } from 'commander'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { addCommand } from './cli/commands/add.js'
import { listCommand } from './cli/commands/list.js'
import { statusCommand } from './cli/commands/status.js'
import { startCommand } from './cli/commands/start.js'
import { stopCommand } from './cli/commands/stop.js'
import { pauseCommand } from './cli/commands/pause.js'
import { resumeCommand } from './cli/commands/resume.js'
import { clearCommand } from './cli/commands/clear.js'
import { runCommand } from './cli/commands/run.js'

const DEFAULT_DATA_DIR = resolve(
  process.env['CCO_DATA_DIR'] ?? join(homedir(), '.cco', 'data'),
)

const program = new Command()
  .name('cco')
  .description('Claude Code Auto-Resume Orchestrator')
  .version('0.1.0')

program
  .command('run')
  .description('Run a task until completion (auto-retry on rate limits)')
  .argument('<prompt>', 'Task prompt for Claude Code')
  .option('--cwd <dir>', 'Working directory', process.cwd())
  .option('--max-retries <n>', 'Maximum retry attempts', '50')
  .action(async (prompt: string, opts) => {
    await runCommand(prompt, {
      cwd: resolve(opts.cwd),
      maxRetries: parseInt(opts.maxRetries, 10),
    })
  })

program
  .command('add')
  .description('Add a new task to the queue')
  .argument('<prompt>', 'Task prompt for Claude Code')
  .option('--cwd <dir>', 'Working directory for the task', process.cwd())
  .option('--priority <n>', 'Priority (lower = higher priority)', '5')
  .option('--data-dir <dir>', 'Data directory', DEFAULT_DATA_DIR)
  .action(async (prompt: string, opts) => {
    await addCommand(prompt, {
      cwd: opts.cwd,
      priority: opts.priority,
      dataDir: opts.dataDir,
    })
  })

program
  .command('list')
  .description('List all tasks')
  .option('--data-dir <dir>', 'Data directory', DEFAULT_DATA_DIR)
  .action(async (opts) => {
    await listCommand({ dataDir: opts.dataDir })
  })

program
  .command('status')
  .description('Show orchestrator status')
  .option('--data-dir <dir>', 'Data directory', DEFAULT_DATA_DIR)
  .action(async (opts) => {
    await statusCommand({ dataDir: opts.dataDir })
  })

program
  .command('start')
  .description('Start processing the task queue')
  .option('--once', 'Process only one task then exit', false)
  .option('--data-dir <dir>', 'Data directory', DEFAULT_DATA_DIR)
  .action(async (opts) => {
    await startCommand({
      dataDir: opts.dataDir,
      once: opts.once,
    })
  })

program
  .command('stop')
  .description('Mark running tasks as paused')
  .option('--data-dir <dir>', 'Data directory', DEFAULT_DATA_DIR)
  .action(async (opts) => {
    await stopCommand({ dataDir: opts.dataDir })
  })

program
  .command('pause')
  .description('Pause a specific task')
  .argument('<taskId>', 'Task ID (or prefix)')
  .option('--data-dir <dir>', 'Data directory', DEFAULT_DATA_DIR)
  .action(async (taskId: string, opts) => {
    await pauseCommand(taskId, { dataDir: opts.dataDir })
  })

program
  .command('resume')
  .description('Resume a paused/rate-limited task, or all if no ID given')
  .argument('[taskId]', 'Task ID (or prefix)')
  .option('--data-dir <dir>', 'Data directory', DEFAULT_DATA_DIR)
  .action(async (taskId: string | undefined, opts) => {
    await resumeCommand(taskId, { dataDir: opts.dataDir })
  })

program
  .command('clear')
  .description('Remove completed and failed tasks')
  .option('--data-dir <dir>', 'Data directory', DEFAULT_DATA_DIR)
  .action(async (opts) => {
    await clearCommand({ dataDir: opts.dataDir })
  })

program.parseAsync().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
