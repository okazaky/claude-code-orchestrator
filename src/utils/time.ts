export function nowISO(): string {
  return new Date().toISOString()
}

export function addMs(isoDate: string, ms: number): string {
  return new Date(new Date(isoDate).getTime() + ms).toISOString()
}

export function msUntil(isoDate: string): number {
  return Math.max(0, new Date(isoDate).getTime() - Date.now())
}

export function isPast(isoDate: string): boolean {
  return new Date(isoDate).getTime() <= Date.now()
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}
