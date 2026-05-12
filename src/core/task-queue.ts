import { v4 as uuidv4 } from 'uuid'
import type { Task, CreateTaskInput, TaskStatus } from '../types/index.js'
import type { StateFile } from '../store/schemas.js'
import { StateStore } from '../store/state-store.js'
import { nowISO } from '../utils/time.js'

export class TaskQueue {
  constructor(private readonly store: StateStore) {}

  async add(input: CreateTaskInput): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      prompt: input.prompt,
      cwd: input.cwd,
      priority: input.priority ?? 5,
      createdAt: nowISO(),
      status: 'pending',
      sessionId: null,
      progressNote: null,
      lastError: null,
      attempts: 0,
      updatedAt: nowISO(),
    }
    await this.store.update((state) => ({
      ...state,
      tasks: [...state.tasks, task],
    }))
    return task
  }

  async getAll(): Promise<readonly Task[]> {
    const state = await this.store.load()
    return state.tasks
  }

  async getById(id: string): Promise<Task | undefined> {
    const state = await this.store.load()
    return state.tasks.find((t) => t.id === id)
  }

  async getNextPending(): Promise<Task | undefined> {
    const state = await this.store.load()
    return state.tasks
      .filter((t) => t.status === 'pending')
      .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt))[0]
  }

  async getNextRunnable(): Promise<Task | undefined> {
    const state = await this.store.load()
    const rateLimited = state.tasks.find((t) => t.status === 'rate_limited')
    if (rateLimited && state.rateLimits.isLimited) {
      return undefined
    }
    if (rateLimited && !state.rateLimits.isLimited) {
      return rateLimited
    }
    return this.getNextPending()
  }

  async updateTask(id: string, updates: Partial<Pick<Task, 'status' | 'sessionId' | 'progressNote' | 'lastError' | 'attempts'>>): Promise<Task | undefined> {
    let updated: Task | undefined
    await this.store.update((state) => ({
      ...state,
      tasks: state.tasks.map((t) => {
        if (t.id !== id) return t
        updated = { ...t, ...updates, updatedAt: nowISO() }
        return updated
      }),
    }))
    return updated
  }

  async clearCompleted(): Promise<number> {
    const state = await this.store.load()
    const completedCount = state.tasks.filter((t) => t.status === 'completed' || t.status === 'failed').length
    await this.store.update((state) => ({
      ...state,
      tasks: state.tasks.filter((t) => t.status !== 'completed' && t.status !== 'failed'),
    }))
    return completedCount
  }

  async getByStatus(status: TaskStatus): Promise<readonly Task[]> {
    const state = await this.store.load()
    return state.tasks.filter((t) => t.status === status)
  }
}
