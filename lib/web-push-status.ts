export type PushSchedulerStatus = {
  state: 'running' | 'stale' | 'not-started' | 'unknown'
  lastCompletedAt: number | null
}

export function schedulerStatus(value: unknown, now = Date.now()): PushSchedulerStatus {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const completed = typeof row.lastCompletedAt === 'number' && Number.isFinite(row.lastCompletedAt)
    && row.lastCompletedAt > 0 && row.lastCompletedAt <= now + 60000 ? row.lastCompletedAt : null
  return { state: completed === null ? 'not-started' : now - completed <= 180000 ? 'running' : 'stale', lastCompletedAt: completed }
}
