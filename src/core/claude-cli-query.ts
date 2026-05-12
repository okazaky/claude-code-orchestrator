import { spawn } from 'node:child_process'

export interface ClaudeCliQueryOptions {
  readonly cwd?: string
  readonly permissionMode?: string
  readonly maxTurns?: number
  readonly resume?: string
  readonly abortController?: AbortController
  readonly stderr?: (data: string) => void
}

export interface ClaudeCliQueryParams {
  readonly prompt: string
  readonly options?: ClaudeCliQueryOptions
}

export type ClaudeCliMessage = Record<string, unknown>

export async function* queryClaudeCli(
  params: ClaudeCliQueryParams,
): AsyncGenerator<ClaudeCliMessage, void> {
  const options = params.options ?? {}
  const args = buildArgs(params.prompt, options)

  const child = spawn('claude', args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    signal: options.abortController?.signal,
  })

  let stdoutBuffer = ''
  let stderrBuffer = ''

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderrBuffer += chunk
    options.stderr?.(chunk)
  })

  child.stdout.setEncoding('utf8')

  for await (const chunk of child.stdout) {
    stdoutBuffer += chunk
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''

    for (const line of lines) {
      const message = parseJsonLine(line)
      if (message) yield message
    }
  }

  const finalMessage = parseJsonLine(stdoutBuffer)
  if (finalMessage) yield finalMessage

  const exitCode = await waitForExit(child)
  if (exitCode !== 0) {
    throw new Error(stderrBuffer.trim() || `claude exited with code ${exitCode}`)
  }
}

function buildArgs(prompt: string, options: ClaudeCliQueryOptions): string[] {
  const args = ['--print', prompt, '--output-format', 'stream-json']

  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode)
  }

  if (options.maxTurns) {
    args.push('--max-turns', String(options.maxTurns))
  }

  if (options.resume) {
    args.push('--resume', options.resume)
  }

  return args
}

function parseJsonLine(line: string): ClaudeCliMessage | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const parsed: unknown = JSON.parse(trimmed)
    return typeof parsed === 'object' && parsed !== null
      ? parsed as ClaudeCliMessage
      : null
  } catch {
    return null
  }
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
}
