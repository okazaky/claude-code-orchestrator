import { logger } from '../utils/logger.js'
import { msUntil, formatDuration } from '../utils/time.js'

export class Scheduler {
  private timerId: ReturnType<typeof setTimeout> | null = null
  private aborted = false
  private pendingResolve: ((value: boolean) => void) | null = null

  async waitUntil(isoDate: string, signal?: AbortSignal): Promise<boolean> {
    const ms = msUntil(isoDate)
    if (ms <= 0) return true

    logger.info(`Waiting ${formatDuration(ms)} until ${isoDate}`)
    return this.waitMs(ms, signal)
  }

  async waitMs(ms: number, signal?: AbortSignal): Promise<boolean> {
    if (this.aborted || signal?.aborted) return false

    return new Promise<boolean>((resolve) => {
      this.pendingResolve = resolve

      const cleanup = () => {
        if (this.timerId !== null) {
          clearTimeout(this.timerId)
          this.timerId = null
        }
        this.pendingResolve = null
      }

      const onAbort = () => {
        cleanup()
        resolve(false)
      }

      signal?.addEventListener('abort', onAbort, { once: true })

      this.timerId = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        cleanup()
        resolve(!this.aborted)
      }, ms)
    })
  }

  cancel(): void {
    this.aborted = true
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
    if (this.pendingResolve) {
      this.pendingResolve(false)
      this.pendingResolve = null
    }
  }

  reset(): void {
    this.aborted = false
  }
}
