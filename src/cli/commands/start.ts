import { queryClaudeCli } from '../../core/claude-cli-query.js'
import { Orchestrator } from '../../core/orchestrator.js'
import { formatDuration } from '../../utils/time.js'
import { notify } from '../../utils/notify.js'

export interface StartOptions {
  readonly dataDir: string
  readonly once: boolean
}

export async function startCommand(options: StartOptions): Promise<void> {
  const queryFn = (params: { prompt: string; options?: Record<string, unknown> }) => {
    return queryClaudeCli({
      prompt: params.prompt,
      options: params.options,
    }) as unknown as AsyncGenerator<Record<string, unknown>, void>
  }

  const orchestrator = new Orchestrator(queryFn, { dataDir: options.dataDir }, {
    onTaskStart: (id) => {
      const short = id.substring(0, 8)
      console.log(`[START] Task ${short}`)
      notify('CCO: Task Started', `Task ${short} started`)
    },
    onTaskComplete: (id, success) => {
      const short = id.substring(0, 8)
      console.log(`[${success ? 'DONE' : 'FAIL'}] Task ${short}`)
      notify(
        success ? 'CCO: Task Completed' : 'CCO: Task Failed',
        `Task ${short} ${success ? 'completed successfully' : 'failed'}`,
      )
    },
    onRateLimited: (id, resumeAt) => {
      const short = id.substring(0, 8)
      const ms = new Date(resumeAt).getTime() - Date.now()
      console.log(`[RATE LIMITED] Task ${short}, resume at ${resumeAt}`)
      notify('CCO: Rate Limited', `Task ${short} rate limited. Resuming in ${formatDuration(Math.max(0, ms))}`)
    },
    onWaiting: (resumeAt) => {
      const ms = new Date(resumeAt).getTime() - Date.now()
      console.log(`[WAITING] Rate limited, resuming in ${formatDuration(Math.max(0, ms))}`)
    },
    onResuming: (id) => {
      const short = id.substring(0, 8)
      console.log(`[RESUME] Task ${short}`)
      notify('CCO: Resuming', `Task ${short} resuming after rate limit`)
    },
  })

  const shutdown = () => {
    console.log('\nShutting down...')
    orchestrator.stop()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await orchestrator.start({ once: options.once })
  } finally {
    process.off('SIGINT', shutdown)
    process.off('SIGTERM', shutdown)
  }
}
