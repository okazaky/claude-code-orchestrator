import { join } from 'node:path'
import type { OrchestratorConfig } from '../types/index.js'
import { DEFAULT_CONFIG } from '../types/index.js'
import { StateStore } from '../store/state-store.js'
import { TaskQueue } from './task-queue.js'
import { RateLimitDetector } from './rate-limit-detector.js'
import { SessionManager, type QueryFunction } from './session-manager.js'
import { Scheduler } from './scheduler.js'
import { InboxWatcher } from './inbox-watcher.js'
import { logger } from '../utils/logger.js'
import { nowISO } from '../utils/time.js'
import { rotateLogsIfNeeded } from '../utils/log-rotator.js'
import { isNonRetryableError } from './error-classifier.js'

export interface OrchestratorEvents {
  onTaskStart?: (taskId: string) => void
  onTaskComplete?: (taskId: string, success: boolean) => void
  onRateLimited?: (taskId: string, resumeAt: string) => void
  onWaiting?: (resumeAt: string) => void
  onResuming?: (taskId: string) => void
}

export class Orchestrator {
  private readonly store: StateStore
  private readonly queue: TaskQueue
  private readonly detector: RateLimitDetector
  private readonly sessionManager: SessionManager
  private readonly scheduler: Scheduler
  private readonly inboxWatcher: InboxWatcher
  private readonly config: OrchestratorConfig
  private running = false
  private abortController: AbortController | null = null

  constructor(
    queryFn: QueryFunction,
    config: Partial<OrchestratorConfig> = {},
    private readonly events: OrchestratorEvents = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.store = new StateStore(this.config.dataDir)
    this.queue = new TaskQueue(this.store)
    this.detector = new RateLimitDetector(this.store, this.config)
    this.sessionManager = new SessionManager(queryFn, this.detector)
    this.scheduler = new Scheduler()
    this.inboxWatcher = new InboxWatcher(this.config.dataDir, this.queue)
  }

  getQueue(): TaskQueue {
    return this.queue
  }

  getStore(): StateStore {
    return this.store
  }

  getDetector(): RateLimitDetector {
    return this.detector
  }

  isRunning(): boolean {
    return this.running
  }

  async start(options: { once?: boolean } = {}): Promise<void> {
    if (this.running) {
      logger.warn('Orchestrator is already running')
      return
    }

    this.running = true
    this.abortController = new AbortController()
    this.scheduler.reset()

    // Rotate old/large logs on startup
    const logDir = join(this.config.dataDir, '..', 'logs')
    await rotateLogsIfNeeded(logDir)

    logger.info('Orchestrator started')

    try {
      await this.loop(options.once ?? false)
    } finally {
      this.running = false
      this.abortController = null
      logger.info('Orchestrator stopped')
    }
  }

  stop(): void {
    logger.info('Stopping orchestrator...')
    this.running = false
    this.sessionManager.abort()
    this.scheduler.cancel()
    this.abortController?.abort()
  }

  private async loop(once: boolean): Promise<void> {
    while (this.running) {
      // Scan inbox for new task files
      const inboxAdded = await this.inboxWatcher.scan()
      if (inboxAdded > 0) {
        logger.info(`Inbox: ${inboxAdded} new task(s) queued`)
      }

      const rateLimitState = await this.detector.getState()

      if (rateLimitState.isLimited && rateLimitState.resumeAt) {
        this.events.onWaiting?.(rateLimitState.resumeAt)
        const shouldContinue = await this.scheduler.waitUntil(
          rateLimitState.resumeAt,
          this.abortController?.signal,
        )
        if (!shouldContinue) break
        await this.detector.clearRateLimit()
      }

      const task = await this.queue.getNextRunnable()
      if (!task) {
        if (once) break
        logger.debug('No runnable tasks, waiting 5s...')
        const shouldContinue = await this.scheduler.waitMs(
          5000,
          this.abortController?.signal,
        )
        if (!shouldContinue) break
        continue
      }

      const isResume = task.status === 'rate_limited'
      if (isResume) {
        this.events.onResuming?.(task.id)
        logger.info(`Resuming task ${task.id}`)
      } else {
        this.events.onTaskStart?.(task.id)
        logger.info(`Starting task ${task.id}: ${task.prompt.substring(0, 80)}`)
      }

      await this.queue.updateTask(task.id, {
        status: 'running',
        attempts: task.attempts + 1,
      })

      const result = await this.sessionManager.runTask(
        { ...task, status: 'running', attempts: task.attempts + 1 },
        isResume ? task.sessionId : undefined,
      )

      if (result.rateLimited) {
        const rlState = await this.detector.getState()
        await this.queue.updateTask(task.id, {
          status: 'rate_limited',
          sessionId: result.sessionId || task.sessionId,
          progressNote: result.resultText ?? task.progressNote,
        })
        this.events.onRateLimited?.(task.id, rlState.resumeAt ?? nowISO())

        if (once) break
        continue
      }

      if (result.success) {
        await this.queue.updateTask(task.id, {
          status: 'completed',
          sessionId: result.sessionId,
          progressNote: result.resultText,
        })
        this.events.onTaskComplete?.(task.id, true)
      } else {
        const nonRetryable = result.error ? isNonRetryableError(result.error) : false
        const shouldRetry = !nonRetryable && task.attempts + 1 < this.config.maxRetries
        if (nonRetryable) {
          logger.error(`Non-retryable error for task ${task.id}: ${result.error}`)
        }
        await this.queue.updateTask(task.id, {
          status: shouldRetry ? 'pending' : 'failed',
          sessionId: result.sessionId || task.sessionId,
          lastError: result.error,
          progressNote: result.resultText ?? task.progressNote,
        })
        this.events.onTaskComplete?.(task.id, false)
      }

      if (once) break
    }
  }
}
