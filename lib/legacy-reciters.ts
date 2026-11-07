/**
 * SAMEE3 — optional audio sources for the HTML-only compatibility player.
 * Compiled Alafasy is deliberately NOT interchangeable with regular Alafasy.
 * This file is server-only and does not use client-side JavaScript.
 */
export type LegacyReciter = Readonly<{ id: string; name: string; lookup?: string; fixedBase?: string }>

export const DEFAULT_LEGACY_RECITER = 'alafasy-collected'
export const LEGACY_RECITERS: readonly LegacyReciter[] = [
  { id: 'alafasy-collected', name: 'مشاري العفاسي — المصحف المجمّع' },
  { id: 'alafasy', name: 'مشاري العفاسي — المصحف المرتّل', fixedBase: 'https://cdn.mp3quran.net/audio/mishary-alafasy/r1/' },
  { id: 'husary', name: 'محمود خليل الحصري', fixedBase: 'https://cdn.mp3quran.net/audio/mahmoud-husary/r1/' },
  { id: 'minshawi', name: 'محمد صديق المنشاوي', lookup: 'محمد صديق المنشاوي' },
  { id: 'maher', name: 'ماهر المعيقلي', lookup: 'ماهر المعيقلي' },
  { id: 'abdulbasit', name: 'عبد الباسط عبد الصمد', lookup: 'عبد الباسط عبد الصمد' },
  { id: 'sudais', name: 'عبد الرحمن السديس', lookup: 'عبد الرحمن السديس' },
  { id: 'dossary', name: 'ياسر الدوسري', lookup: 'ياسر الدوسري' },
  { id: 'ghamdi', name: 'سعد الغامدي', lookup: 'سعد الغامدي' },
]

export function selectLegacyReciter(raw: string | null): LegacyReciter {
  return LEGACY_RECITERS.find((reciter) => reciter.id === raw) || LEGACY_RECITERS[0]
}

export function legacyReciterOptions(selected: string): string {
  return LEGACY_RECITERS.map((reciter) =>
    `<option value="${reciter.id}"${reciter.id === selected ? ' selected' : ''}>${reciter.name}</option>`
  ).join('')
}

export function legacyAudioPageUrl(surah: number, reciter: string): string {
  return `/api/legacy-audio?surah=${surah}&reciter=${encodeURIComponent(reciter)}`
}

export function legacyQuranPageUrl(page: number, riwaya: string, reciter: string): string {
  return `/api/legacy-quran?page=${page}&riwaya=${encodeURIComponent(riwaya)}&reciter=${encodeURIComponent(reciter)}`
}

const COLLECTED_RELEASE = 'https://github.com/PSYMOHAMEDABOZAID/alafasy-collected-quran/releases/download/v1.0.0'

/** For the *exact* compiled release, do not silently substitute another recording. */
export function collectedOriginalUrl(surah: number): string {
  return `${COLLECTED_RELEASE}/${String(surah).padStart(3, '0')}.mp3`
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[\u064B-\u065F\u0670ـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/عبد\s+/g, 'عبد').replace(/\s+/g, ' ').trim()
}

function allowedMp3quranBase(input: unknown): string | null {
  if (typeof input !== 'string') return null
  try {
    const url = new URL(input)
    const domain = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null
    if (domain !== 'mp3quran.net' && !domain.endsWith('.mp3quran.net')) return null
    if (!url.pathname.startsWith('/') || url.pathname.includes('..') || url.pathname.includes('\\')) return null
    return url.origin + (url.pathname.endsWith('/') ? url.pathname : url.pathname + '/')
  } catch { return null }
}

type ApiMoshaf = { name?: unknown; server?: unknown; surah_total?: unknown; surah_list?: unknown }
type ApiReciter = { name?: unknown; moshaf?: unknown }
let catalogCache: { expires: number; reciters: ApiReciter[] } | null = null

async function loadReciterCatalog(): Promise<ApiReciter[] | null> {
  if (catalogCache && catalogCache.expires > Date.now()) return catalogCache.reciters
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4500)
  try {
    const res = await fetch('https://mp3quran.net/api/v3/reciters?language=ar', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      next: { revalidate: 21600 },
    })
    if (!res.ok) return null
    const value: unknown = await res.json()
    if (!value || typeof value !== 'object' || !('reciters' in value)) return null
    const rows = (value as { reciters: unknown }).reciters
    if (!Array.isArray(rows)) return null
    const reciters = rows.slice(0, 1000) as ApiReciter[]
    catalogCache = { expires: Date.now() + 6 * 60 * 60 * 1000, reciters }
    return reciters
  } catch { return null }
  finally { clearTimeout(timeout) }
}

/**
 * Audio is requested by the *browser*, never downloaded/processed on this route.
 * Exact compiled files use the site's own range-capable /api/alafasy-audio route.
 * All other reciters require verified, Hafs MP3Quran sources.
 */
export async function legacySurahAudioUrl(reciter: LegacyReciter, surah: number): Promise<string | null> {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null
  const padded = String(surah).padStart(3, '0')
  if (reciter.id === DEFAULT_LEGACY_RECITER) return `/api/alafasy-audio/${padded}.mp3`
  if (reciter.fixedBase) {
    const safe = allowedMp3quranBase(reciter.fixedBase)
    return safe ? `${safe}${padded}.mp3` : null
  }
  if (!reciter.lookup) return null
  const catalog = await loadReciterCatalog()
  if (!catalog) return null
  const identity = norm(reciter.lookup)
  const match = catalog.find((row) => typeof row?.name === 'string' && norm(row.name) === identity)
  if (!match || !Array.isArray(match.moshaf)) return null
  const candidates = (match.moshaf as ApiMoshaf[]).filter((m) => {
    if (!m || typeof m.name !== 'string' || !/(حفص|hafs)/i.test(norm(m.name))) return false
    const listed = typeof m.surah_list === 'string' ? m.surah_list.split(',').map((x) => Number(x.trim())) : []
    // Exclude incomplete recordings unless the requested surah is explicitly listed.
    return listed.length ? listed.includes(surah) : Number(m.surah_total) === 114
  })
  const preferred = candidates.find((m) => Number(m.surah_total) === 114) || candidates[0]
  const safeBase = preferred ? allowedMp3quranBase(preferred.server) : null
  return safeBase ? `${safeBase}${padded}.mp3` : null
}
