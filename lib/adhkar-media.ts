export type AdhkarMedia = {
  section: string
  text?: string
  number?: number
  total?: number
  recordingId?: string
}

export type MediaDhikr = {
  id: string
  number: number
  text: string
  startMs: number
  endMs: number
}

/** Never leave the previous dhikr visible in a gap or beyond a declared end. */
export function currentMediaDhikr(rows: MediaDhikr[], seconds: number): MediaDhikr | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null
  const at = seconds * 1000
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index]
    if (at < row.startMs) continue
    const end = Math.min(row.endMs, rows[index + 1]?.startMs ?? Infinity)
    return at < end ? row : null
  }
  return null
}

export function parseMediaDhikrs(value: unknown): MediaDhikr[] {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is MediaDhikr => Boolean(row && typeof row === 'object'
    && typeof row.id === 'string' && typeof row.text === 'string' && row.text.trim()
    && Number.isInteger(row.number) && row.number > 0
    && Number.isFinite(row.startMs) && row.startMs >= 0
    && Number.isFinite(row.endMs) && row.endMs > row.startMs))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
}
