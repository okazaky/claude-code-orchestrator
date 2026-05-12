export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

let currentLevel: LogLevel = 'info'

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

function formatTimestamp(): string {
  return new Date().toISOString()
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

export const logger = {
  debug(message: string, data?: unknown): void {
    if (shouldLog('debug')) {
      console.debug(`[${formatTimestamp()}] DEBUG: ${message}`, data ?? '')
    }
  },

  info(message: string, data?: unknown): void {
    if (shouldLog('info')) {
      console.info(`[${formatTimestamp()}] INFO: ${message}`, data ?? '')
    }
  },

  warn(message: string, data?: unknown): void {
    if (shouldLog('warn')) {
      console.warn(`[${formatTimestamp()}] WARN: ${message}`, data ?? '')
    }
  },

  error(message: string, data?: unknown): void {
    if (shouldLog('error')) {
      console.error(`[${formatTimestamp()}] ERROR: ${message}`, data ?? '')
    }
  },
}
