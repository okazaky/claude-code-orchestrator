import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { type StateFile, stateFileSchema, EMPTY_STATE } from './schemas.js'
import { logger } from '../utils/logger.js'

export class StateStore {
  private readonly filePath: string

  constructor(dataDir: string) {
    this.filePath = join(dataDir, 'state.json')
  }

  async load(): Promise<StateFile> {
    if (!existsSync(this.filePath)) {
      return EMPTY_STATE
    }
    try {
      const raw = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      return stateFileSchema.parse(parsed)
    } catch (error) {
      logger.error('Failed to load state file, returning empty state', error)
      return EMPTY_STATE
    }
  }

  async save(state: StateFile): Promise<void> {
    const validated = stateFileSchema.parse(state)
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    const tmpPath = `${this.filePath}.tmp.${Date.now()}`
    await writeFile(tmpPath, JSON.stringify(validated, null, 2), 'utf-8')
    await rename(tmpPath, this.filePath)
  }

  async update(fn: (state: StateFile) => StateFile): Promise<StateFile> {
    const current = await this.load()
    const next = fn(current)
    await this.save(next)
    return next
  }
}
