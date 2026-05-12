import { existsSync } from 'node:fs'
import { queryClaudeCli } from '../../core/claude-cli-query.js'
import { detectRateLimit, calculateBackoff } from '../../core/rate-limit-detector.js'
import { DEFAULT_CONFIG } from '../../types/config.js'
import { formatDuration } from '../../utils/time.js'
import { notify } from '../../utils/notify.js'
import { logger } from '../../utils/logger.js'
import { isNonRetryableError } from '../../core/error-classifier.js'

export interface RunOptions {
  readonly cwd: string
  readonly maxRetries: number
}

/**
 * Single-shot runner: executes a prompt with Claude Code,
 * retrying on rate limits until completion.
 * No daemon, no queue — just run until done.
 */
export async function runCommand(prompt: string, options: RunOptions): Promise<void> {
  if (!existsSync(options.cwd)) {
    console.error(`Error: cwd does not exist: ${options.cwd}`)
    process.exitCode = 1
    return
  }

  let sessionId: string | null = null
  let attempt = 0
  let totalCostUsd = 0
  let totalTurns = 0

  const shutdown = () => {
    console.log('\nInterrupted by user.')
    process.exit(130)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  console.log(`[CCO] Task: ${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}`)
  console.log(`[CCO] CWD: ${options.cwd}`)
  console.log('')

  while (attempt < options.maxRetries) {
    attempt++

    const isResume = sessionId !== null
    if (isResume) {
      console.log(`[CCO] Resuming session (attempt ${attempt})...`)
      notify('CCO: Resuming', `Attempt ${attempt} — resuming after rate limit`)
    } else {
      console.log(`[CCO] Starting session...`)
    }

    const result = await runOnce(prompt, {
      cwd: options.cwd,
      resumeSessionId: sessionId,
    })

    // Accumulate costs
    totalCostUsd += result.costUsd
    totalTurns += result.numTurns

    // Capture session ID for future resumes
    if (result.sessionId) {
      sessionId = result.sessionId
    }

    // Success — we're done
    if (result.success) {
      console.log('')
      console.log(`[CCO] Completed!`)
      console.log(`[CCO] Total cost: $${totalCostUsd.toFixed(4)}`)
      console.log(`[CCO] Total turns: ${totalTurns}`)
      console.log(`[CCO] Attempts: ${attempt}`)
      notify('CCO: Task Completed', `Finished in ${attempt} attempt(s), $${totalCostUsd.toFixed(4)}`)
      return
    }

    // Rate limited — wait and retry
    if (result.rateLimited) {
      const backoffMs = calculateBackoff(attempt - 1, DEFAULT_CONFIG)
      console.log(`[CCO] Rate limited. Waiting ${formatDuration(backoffMs)}...`)
      notify('CCO: Rate Limited', `Waiting ${formatDuration(backoffMs)} before retry`)

      await sleep(backoffMs)
      continue
    }

    // Non-rate-limit error
    console.error(`[CCO] Error: ${result.error}`)

    if (result.error && isNonRetryableError(result.error)) {
      console.error(`[CCO] Non-retryable error. Stopping.`)
      notify('CCO: Task Failed', `Non-retryable error: ${result.error.substring(0, 80)}`)
      process.exitCode = 1
      return
    }

    if (attempt < options.maxRetries) {
      const backoffMs = Math.min(30_000 * attempt, 300_000)
      console.log(`[CCO] Retrying in ${formatDuration(backoffMs)}...`)
      await sleep(backoffMs)
      continue
    }

    console.error(`[CCO] Failed after ${attempt} attempts.`)
    notify('CCO: Task Failed', `Failed after ${attempt} attempts`)
    process.exitCode = 1
    return
  }

  console.error(`[CCO] Max retries (${options.maxRetries}) reached.`)
  notify('CCO: Task Failed', `Max retries reached`)
  process.exitCode = 1
}

interface RunOnceResult {
  readonly sessionId: string
  readonly success: boolean
  readonly rateLimited: boolean
  readonly error: string | null
  readonly costUsd: number
  readonly numTurns: number
}

async function runOnce(
  prompt: string,
  opts: { cwd: string; resumeSessionId: string | null },
): Promise<RunOnceResult> {
  let sessionId = ''
  let success = false
  let rateLimited = false
  let error: string | null = null
  let costUsd = 0
  let numTurns = 0

  const cliOptions = {
    cwd: opts.cwd,
    maxTurns: 200,
    ...(opts.resumeSessionId ? { resume: opts.resumeSessionId } : {}),
    stderr: (data: string) => {
      const detection = detectRateLimit(data)
      if (detection.isRateLimited) {
        logger.warn(`Rate limit signal in stderr: ${data.substring(0, 100)}`)
      }
    },
  }

  // On resume, send a "continue" prompt instead of original
  const effectivePrompt = opts.resumeSessionId
    ? 'Continue where you left off. Complete the original task.'
    : prompt

  try {
    const gen = queryClaudeCli({
      prompt: effectivePrompt,
      options: cliOptions,
    })

    for await (const message of gen) {
      const msg = message as Record<string, unknown>

      if (msg.session_id && !sessionId) {
        sessionId = msg.session_id as string
      }

      if (msg.type === 'result') {
        costUsd = (msg.total_cost_usd as number) ?? 0
        numTurns = (msg.num_turns as number) ?? 0

        if (msg.is_error) {
          const resultText = (msg.result as string) ?? ''
          const detection = detectRateLimit(resultText)
          if (detection.isRateLimited) {
            rateLimited = true
            break
          }
          error = resultText || `Session ended with: ${msg.subtype}`
        } else if (msg.subtype === 'success') {
          success = true
        } else {
          error = `Session ended with: ${msg.subtype}`
        }
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    const detection = detectRateLimit(errMsg)
    if (detection.isRateLimited) {
      rateLimited = true
    } else {
      error = errMsg
    }
  }

  return {
    sessionId: sessionId || opts.resumeSessionId || '',
    success,
    rateLimited,
    error,
    costUsd,
    numTurns,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
