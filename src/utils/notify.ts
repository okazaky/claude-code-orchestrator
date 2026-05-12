import { exec } from 'node:child_process'
import { logger } from './logger.js'

export function notify(title: string, message: string): void {
  const escaped = message.replace(/"/g, '\\"').substring(0, 200)
  const escapedTitle = title.replace(/"/g, '\\"')

  const script = `display notification "${escaped}" with title "${escapedTitle}"`

  exec(`osascript -e '${script}'`, (error) => {
    if (error) {
      logger.debug(`Notification failed: ${error.message}`)
    }
  })
}
