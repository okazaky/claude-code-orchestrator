import type { Task } from '../types/index.js'
import type { RateLimitDetector, DetectionResult } from './rate-limit-detector.js'
import { logger } from '../utils/logger.js'

export interface SessionResult {
  readonly sessionId: string
  readonly success: boolean
  readonly resultText: string | null
  readonly rateLimited: boolean
  readonly error: string | null
  readonly costUsd: number
  readonly numTurns: number
}

export interface QueryFunction {
  (params: { prompt: string; options?: Record<string, unknown> }): AsyncGenerator<Record<string, unknown>, void>
}

export class SessionManager {
  private currentAbortController: AbortController | null = null

  constructor(
    private readonly queryFn: QueryFunction,
    private readonly rateLimitDetector: RateLimitDetector,
  ) {}

  async runTask(task: Task, resumeSessionId?: string | null): Promise<SessionResult> {
    const abortController = new AbortController()
    this.currentAbortController = abortController

    let sessionId = ''
    let resultText: string | null = null
    let success = false
    let rateLimited = false
    let error: string | null = null
    let costUsd = 0
    let numTurns = 0

    const prompt = resumeSessionId && task.progressNote
      ? `Continue from where you left off. Progress so far: ${task.progressNote}\n\nOriginal task: ${task.prompt}`
      : task.prompt

    const options: Record<string, unknown> = {
      cwd: task.cwd,
      abortController,
      maxTurns: 200,
      ...(resumeSessionId ? { resume: resumeSessionId } : {}),
      stderr: (data: string) => {
        this.handleStderr(data, task.id)
      },
    }

    try {
      const queryGen = this.queryFn({ prompt, options })

      for await (const message of queryGen) {
        if (abortController.signal.aborted) {
          error = 'Session aborted'
          break
        }

        const msgSessionId = message.session_id as string | undefined
        if (msgSessionId && !sessionId) {
          sessionId = msgSessionId
        }

        const handled = await this.handleMessage(message, task.id)
        if (handled.rateLimited) {
          rateLimited = true
          break
        }

        if (message.type === 'result') {
          const result = message as Record<string, unknown>
          costUsd = (result.total_cost_usd as number) ?? 0
          numTurns = (result.num_turns as number) ?? 0

          if (result.subtype === 'success') {
            success = true
            resultText = (result.result as string) ?? null
          } else {
            error = `Session ended with: ${result.subtype}`
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.error(`Session error for task ${task.id}: ${errMsg}`)

      const detection = await this.rateLimitDetector.handleMessage(errMsg, task.id)
      if (detection.isRateLimited) {
        rateLimited = true
      } else {
        error = errMsg
      }
    } finally {
      this.currentAbortController = null
    }

    return {
      sessionId: sessionId || resumeSessionId || '',
      success,
      resultText,
      rateLimited,
      error,
      costUsd,
      numTurns,
    }
  }

  abort(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
      this.currentAbortController = null
    }
  }

  private async handleMessage(
    message: Record<string, unknown>,
    taskId: string,
  ): Promise<{ rateLimited: boolean }> {
    if (message.type === 'result') {
      const result = message as Record<string, unknown>
      if (result.is_error) {
        const resultText = (result.result as string) ?? ''
        const detection = await this.rateLimitDetector.handleMessage(resultText, taskId)
        if (detection.isRateLimited) {
          return { rateLimited: true }
        }
      }
    }
    return { rateLimited: false }
  }

  private async handleStderr(data: string, taskId: string): Promise<void> {
    logger.debug(`stderr [${taskId}]: ${data}`)
    await this.rateLimitDetector.handleMessage(data, taskId)
  }
}
