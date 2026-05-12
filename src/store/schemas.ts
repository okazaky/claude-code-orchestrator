import { z } from 'zod'

export const taskStatusSchema = z.enum([
  'pending',
  'running',
  'paused',
  'rate_limited',
  'completed',
  'failed',
])

export const taskSchema = z.object({
  id: z.string().uuid(),
  prompt: z.string().min(1),
  cwd: z.string().min(1),
  priority: z.number().int().min(0).max(100),
  createdAt: z.string().datetime(),
  status: taskStatusSchema,
  sessionId: z.string().nullable(),
  progressNote: z.string().nullable(),
  lastError: z.string().nullable(),
  attempts: z.number().int().min(0),
  updatedAt: z.string().datetime(),
})

export const rateLimitEventSchema = z.object({
  detectedAt: z.string().datetime(),
  taskId: z.string().uuid(),
  resetAt: z.string().datetime().nullable(),
  rawMessage: z.string(),
  backoffMs: z.number().int().min(0),
  attemptNumber: z.number().int().min(0),
})

export const rateLimitStateSchema = z.object({
  isLimited: z.boolean(),
  events: z.array(rateLimitEventSchema),
  currentBackoffMs: z.number().int().min(0),
  resumeAt: z.string().datetime().nullable(),
})

export const stateFileSchema = z.object({
  tasks: z.array(taskSchema),
  rateLimits: rateLimitStateSchema,
  version: z.number().int(),
})

export type StateFile = z.infer<typeof stateFileSchema>

export const EMPTY_STATE: StateFile = {
  tasks: [],
  rateLimits: {
    isLimited: false,
    events: [],
    currentBackoffMs: 0,
    resumeAt: null,
  },
  version: 1,
}
