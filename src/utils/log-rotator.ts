import { readdir, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { logger } from './logger.js'

const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_LOG_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export async function rotateLogsIfNeeded(logDir: string): Promise<void> {
  if (!existsSync(logDir)) return

  try {
    const files = await readdir(logDir)
    const logFiles = files.filter((f) => f.endsWith('.log'))
    const now = Date.now()

    for (const file of logFiles) {
      const filePath = join(logDir, file)
      const fileStat = await stat(filePath)

      const tooOld = now - fileStat.mtimeMs > MAX_LOG_AGE_MS
      const tooLarge = fileStat.size > MAX_LOG_SIZE_BYTES

      if (tooOld || tooLarge) {
        await unlink(filePath)
        logger.info(`Rotated log: ${file} (${tooOld ? 'old' : 'large'})`)
      }
    }
  } catch (error) {
    logger.error('Log rotation failed', error)
  }
}
