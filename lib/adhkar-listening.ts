export type AdhkarListeningMode = 'remaining' | 'once' | 'custom'
export function adhkarListeningCount(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 3
  const n = Number(value)
  return Number.isSafeInteger(n) && n > 0 ? Math.min(1000, n) : 3
}
export function parseAdhkarListening(value: unknown) {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    listeningMode: (row.listeningMode === 'once' || row.listeningMode === 'custom' ? row.listeningMode : 'remaining') as AdhkarListeningMode,
    customRepeats: adhkarListeningCount(row.customRepeats),
    viewMode: (row.viewMode === 'list' ? 'list' : 'focus') as 'list' | 'focus',
  }
}
