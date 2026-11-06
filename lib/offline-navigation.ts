/** Cache names include a deployed build ID after the numeric SW version. */
export function currentOfflineCache(names: string[], type: 'navigation' | 'assets' | 'rsc'): string | null {
  const pattern = new RegExp(`^samee3-sw-v(\\d+)-(?:.+-)?${type}$`)
  return names.map((name, index) => ({ name, index, match: pattern.exec(name) }))
    .filter(entry => entry.match)
    .sort((a, b) => Number(b.match![1]) - Number(a.match![1]) || b.index - a.index)[0]?.name || null
}

export function offlineRscKey(input: string, origin: string): string {
  const url = new URL(input, origin)
  url.searchParams.delete('_rsc')
  return new URL(`/__samee3_rsc?path=${encodeURIComponent(url.pathname + url.search)}`, origin).href
}

/** These routes read query parameters in client components, not server data. */
export const QUERY_INDEPENDENT_ROUTES = new Set([
  '/', '/mushaf', '/surahs', '/index', '/adhkar', '/adhkar/read', '/adhkar/recordings', '/hadith',
  '/audio', '/audio/alafasy-riwayat', '/prayer', '/islamic-library',
  '/offline', '/offline/manage', '/offline/test', '/notifications',
])
