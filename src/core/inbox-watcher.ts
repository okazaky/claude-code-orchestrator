import { readdir, readFile, rename, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { TaskQueue } from './task-queue.js'
import { logger } from '../utils/logger.js'

interface TaskFileMeta {
  readonly cwd: string
  readonly priority: number
  readonly prompt: string
}

/**
 * Watches data/inbox/ for .md and .txt files.
 *
 * File format:
 * ```
 * ---
 * cwd: /path/to/project
 * priority: 1
 * ---
 * Prompt text here...
 * ```
 *
 * Frontmatter is optional. Defaults: cwd = $HOME, priority = 5.
 * After ingestion, file is moved to data/processed/.
 */
export class InboxWatcher {
  private readonly inboxDir: string
  private readonly processedDir: string

  constructor(
    dataDir: string,
    private readonly queue: TaskQueue,
  ) {
    this.inboxDir = join(dataDir, 'inbox')
    this.processedDir = join(dataDir, 'processed')
  }

  async scan(): Promise<number> {
    await this.ensureDirs()

    if (!existsSync(this.inboxDir)) return 0

    const files = await readdir(this.inboxDir)
    const taskFiles = files.filter(
      (f) => f.endsWith('.md') || f.endsWith('.txt'),
    )

    let added = 0

    for (const file of taskFiles) {
      try {
        const filePath = join(this.inboxDir, file)
        const content = await readFile(filePath, 'utf-8')
        const meta = this.parseTaskFile(content)

        if (!existsSync(meta.cwd)) {
          logger.error(`Inbox: skipping ${file} — cwd does not exist: ${meta.cwd}`)
          const destPath = join(this.processedDir, `${Date.now()}_INVALID_${basename(file)}`)
          await rename(filePath, destPath)
          continue
        }

        const task = await this.queue.add({
          prompt: meta.prompt,
          cwd: meta.cwd,
          priority: meta.priority,
        })

        const destPath = join(this.processedDir, `${Date.now()}_${basename(file)}`)
        await rename(filePath, destPath)

        logger.info(`Inbox: added task ${task.id.substring(0, 8)} from ${file}`)
        added++
      } catch (error) {
        logger.error(`Inbox: failed to process ${file}`, error)
      }
    }

    return added
  }

  private parseTaskFile(content: string): TaskFileMeta {
    const trimmed = content.trim()
    const home = process.env['HOME'] ?? '/tmp'

    const frontmatterMatch = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/.exec(trimmed)

    if (!frontmatterMatch) {
      return { cwd: home, priority: 5, prompt: trimmed }
    }

    const frontmatter = frontmatterMatch[1]
    const prompt = frontmatterMatch[2].trim()

    let cwd = home
    let priority = 5

    const cwdMatch = /^cwd:\s*(.+)$/m.exec(frontmatter)
    if (cwdMatch) {
      cwd = cwdMatch[1].trim().replace(/^~/, home)
    }

    const priorityMatch = /^priority:\s*(\d+)$/m.exec(frontmatter)
    if (priorityMatch) {
      priority = parseInt(priorityMatch[1], 10)
    }

    return { cwd, priority, prompt }
  }

  private async ensureDirs(): Promise<void> {
    for (const dir of [this.inboxDir, this.processedDir]) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }
    }
  }
}
