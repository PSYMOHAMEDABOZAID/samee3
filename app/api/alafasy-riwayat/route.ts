import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Edition = {
  id: string
  name: string
  source: string
  sourceUrl: string
  server: string
  surahIds: number[]
}
type Catalog = { reciter: string; editions: Edition[] }
type Mp3Moshaf = { id?: number; name?: string; server?: string; surah_list?: string }
type Mp3Reciter = { id?: number; name?: string; moshaf?: Mp3Moshaf[] }

const MP3_ENDPOINT = 'https://mp3quran.net/api/v3/reciters?language=ar&reciter=123'
const WAY_HOME = 'https://way2quran.com/ar/reciters/mishary-alafasy'
const WAY_MEDIA = 'https://media.way2quran.com/mishary-alafasy/'
const WAY_READINGS: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: 'hafs-an-asim', name: 'حفص عن عاصم — مرتل' },
  { slug: 'ad-duri-an-al-kisai', name: 'الدوري عن الكسائي' },
  { slug: 'warsh-an-nafi', name: 'ورش عن نافع' },
  { slug: 'khalaf-an-hamzah', name: 'خلف عن حمزة' },
  { slug: 'as-susi-an-abu-amr', name: 'السوسي عن أبي عمرو' },
  { slug: 'qunbul-an-ibn-kathir', name: 'قنبل عن ابن كثير' },
  { slug: 'ruways-an-yaqub-al-hadrami', name: 'رويس عن يعقوب الحضرمي' },
  { slug: 'ibn-dhakwan-an-ibn-amir', name: 'ابن ذكوان عن ابن عامر' },
  { slug: 'abi-al-harith-an-al-kisai', name: 'أبو الحارث عن الكسائي' },
  { slug: 'ishaq-al-warraq-wa-idris-al-haddad-an-khalaf-al-bazzar', name: 'إسحاق الوراق وإدريس الحداد عن خلف البزار' },
  { slug: 'shubah-an-asim', name: 'شعبة عن عاصم' },
  { slug: 'ad-duri-an-abi-amr', name: 'الدوري عن أبي عمرو' },
]

function allowServer(input: unknown): string | null {
  if (typeof input !== 'string') return null
  try {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null
    if (!/^([a-z0-9-]+\.)*mp3quran\.net$/i.test(url.hostname)) return null
    if (url.search || url.hash) return null
    return url.href.endsWith('/') ? url.href : `${url.href}/`
  } catch { return null }
}
function surahIds(input: unknown): number[] {
  if (typeof input !== 'string') return []
  return [...new Set(input.split(',').map(v => Number(v.trim()))
    .filter(n => Number.isInteger(n) && n >= 1 && n <= 114))].sort((a, b) => a - b)
}
const pad = (n: number) => String(n).padStart(3, '0')
const buildUrl = (edition: Edition, surah: number) => new URL(`${pad(surah)}.mp3`, edition.server).href

async function mp3quranEditions(): Promise<Edition[]> {
  const response = await fetch(MP3_ENDPOINT, {
    next: { revalidate: 3600 }, signal: AbortSignal.timeout(9000),
  })
  if (!response.ok) throw new Error(`MP3Quran: ${response.status}`)
  const data = await response.json() as { reciters?: Mp3Reciter[] }
  const reciter = (data.reciters || []).find(r => Number(r.id) === 123 && /العفاسي/.test(r.name || ''))
  if (!reciter) return []
  return (reciter.moshaf || []).flatMap(item => {
    const server = allowServer(item.server)
    const available = surahIds(item.surah_list)
    if (!server || typeof item.id !== 'number' || !Number.isInteger(item.id) || !available.length) return []
    return [{
      id: `mp3-${item.id}`,
      name: item.name || 'مصحف العفاسي',
      source: 'MP3Quran',
      sourceUrl: 'https://www.mp3quran.net/ar/afs',
      server,
      surahIds: available,
    }]
  })
}

async function wayEdition(reading: { slug: string; name: string }): Promise<Edition | null> {
  try {
    const pageUrl = `${WAY_HOME}?recitationSlug=${encodeURIComponent(reading.slug)}`
    const response = await fetch(pageUrl, {
      next: { revalidate: 21600 }, signal: AbortSignal.timeout(9000),
    })
    if (!response.ok) return null
    const html = await response.text()
    if (html.length > 4_000_000) return null
    const normalized = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&')
    const pattern = /https:\/\/media\.way2quran\.com\/mishary-alafasy\/([a-z0-9-]+)\/(\d{3})\.mp3/gi
    const matches = [...normalized.matchAll(pattern)]
    const available = [...new Set(matches
      .filter(match => match[1] === reading.slug)
      .map(match => Number(match[2]))
      .filter(n => n >= 1 && n <= 114))].sort((a, b) => a - b)
    if (!available.length) return null
    return {
      id: `way-${reading.slug}`,
      name: reading.name,
      source: 'الطريق إلى القرآن',
      sourceUrl: pageUrl,
      server: `${WAY_MEDIA}${reading.slug}/`,
      surahIds: available,
    }
  } catch { return null }
}

function dedupeSameAudioServer(editions: Edition[]): Edition[] {
  // A URL to the same server/directory is not a different recording.
  // Keep the first publisher and never fabricate a different riwaya.
  const seen = new Set<string>()
  return editions.filter(item => {
    const key = item.server.replace(/\/+$/, '/').toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Targeted safeguard for Shubah/Hafs mixups from providers.
 * Matching names or durations do NOT prove two recitations identical.
 * A matching byte sequence from the MIDDLE of Al-Baqarah is very strong
 * evidence the source actually exposes the same MP3 under two labels.
 * If either provider rejects a partial Range request, KEEP both entries.
 * This check fetches only 32 KiB per candidate and never materializes MP3s.
 */
async function sampleAudio(edition: Edition): Promise<Uint8Array | null> {
  if (!edition.surahIds.includes(2)) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3500)
  try {
    const response = await fetch(buildUrl(edition, 2), {
      cache: 'no-store',
      headers: { Range: 'bytes=131072-163839' },
      signal: controller.signal,
    })
    if (response.status !== 206 ||
      !/^bytes 131072-163839\//i.test(response.headers.get('content-range') || '') ||
      Number(response.headers.get('content-length') || 0) > 32768) {
      await response.body?.cancel().catch(() => undefined)
      return null
    }
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes.byteLength === 32768 ? bytes : null
  } catch { return null }
  finally { clearTimeout(timeout) }
}
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((value, i) => value === b[i])
}
async function removeConfirmedCopies(editions: Edition[]): Promise<Edition[]> {
  // Compare only the two reading families reported as duplicated. A source
  // that lacks a verified Range response is kept, rather than falsely removed.
  const suspects = editions.filter(e => /حفص|شعبة/.test(e.name) && e.surahIds.includes(2))
  const checked = await Promise.all(suspects.map(async item => ({
    id: item.id,
    data: await sampleAudio(item),
  })))
  const samples = new Map(checked.map(item => [item.id, item.data]))
  const redundant = new Set<string>()

  // Prefer the first publisher in catalog order when both are HAFS and
  // the sample is identical. Do not remove a partial edition containing
  // additional surahs that are missing from its prospective replacement.
  for (let i = 0; i < editions.length; i++) {
    const edition = editions[i]
    if (!/حفص/.test(edition.name)) continue
    const sample = samples.get(edition.id)
    if (!sample) continue
    for (let j = 0; j < i; j++) {
      const first = editions[j]
      const earlier = samples.get(first.id)
      if (!/حفص/.test(first.name) || !earlier || redundant.has(first.id)) continue
      if (edition.surahIds.every(id => first.surahIds.includes(id)) && equalBytes(sample, earlier)) {
        redundant.add(edition.id)
        break
      }
    }
  }

  // A supposed Shu'bah recording that is byte-identical to HAFS is NOT a
  // distinct Shu'bah performance; keep the HAFS source and suppress the alias.
  const hafs = editions.filter(e => /حفص/.test(e.name) && !redundant.has(e.id))
  for (const edition of editions) {
    if (!/شعبة/.test(edition.name)) continue
    const sample = samples.get(edition.id)
    if (sample && hafs.some(h => {
      const other = samples.get(h.id)
      return other != null && equalBytes(sample, other)
    })) redundant.add(edition.id)
  }
  return editions.filter(item => !redundant.has(item.id))
}

let cached: { value: Catalog; expires: number } | null = null
async function getCatalog(): Promise<Catalog> {
  if (cached && Date.now() < cached.expires) return cached.value
  const [official, other] = await Promise.all([
    mp3quranEditions().catch((): Edition[] => []),
    Promise.all(WAY_READINGS.map(wayEdition)),
  ])
  const combined = dedupeSameAudioServer([
    ...official,
    ...other.filter((item): item is Edition => item !== null),
  ])
  const editions = await removeConfirmedCopies(combined)
  if (!editions.length && cached) return cached.value
  const result = { reciter: 'مشاري راشد العفاسي', editions }
  if (editions.length) cached = { value: result, expires: Date.now() + 30 * 60_000 }
  return result
}

const errorResponse = (message: string, status: number) =>
  NextResponse.json({ error: message }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams
  const resolve = params.get('resolve')
  const stream = params.get('stream')
  if (!resolve && !stream) {
    const catalog = await getCatalog()
    return catalog.editions.length
      ? NextResponse.json(catalog, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300' } })
      : errorResponse('مصادر التلاوات غير متاحة مؤقتًا.', 503)
  }
  const surah = Number(params.get('surah'))
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return errorResponse('رقم السورة غير صحيح.', 400)
  const editionId = resolve || stream || ''
  const catalog = await getCatalog()
  const edition = catalog.editions.find(e => e.id === editionId && e.surahIds.includes(surah))
  if (!edition) return errorResponse('السورة غير متاحة في هذا المصحف.', 404)
  const source = buildUrl(edition, surah)
  const path = `/api/alafasy-riwayat?stream=${encodeURIComponent(edition.id)}&surah=${surah}`
  if (resolve) return NextResponse.json({
    audioUrl: path, sourceUrl: edition.sourceUrl, directUrl: source,
  }, { headers: { 'Cache-Control': 'no-store' } })

  const range = request.headers.get('range')
  if (range && !/^bytes=\d*-\d*$/.test(range)) return errorResponse('مدى الملف غير صحيح.', 416)
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 18000)
    let upstream: Response
    try {
      upstream = await fetch(source, {
        cache: 'no-store',
        headers: range ? { Range: range, Accept: 'audio/mpeg,audio/*' } : { Accept: 'audio/mpeg,audio/*' },
        signal: controller.signal,
        redirect: 'follow',
      })
    } finally { clearTimeout(timer) }
    const destination = new URL(upstream.url)
    const allowed = /^(?:[a-z0-9-]+\.)*mp3quran\.net$/i.test(destination.hostname) ||
      destination.hostname === 'media.way2quran.com'
    if (!allowed || destination.protocol !== 'https:' || !upstream.ok || !upstream.body) {
      await upstream.body?.cancel().catch(() => undefined)
      return errorResponse('الملف الصوتي غير متاح من المصدر.', 502)
    }
    const mime = upstream.headers.get('content-type') || ''
    if (mime.includes('text/html') || mime.includes('application/json')) {
      await upstream.body.cancel().catch(() => undefined)
      return errorResponse('المصدر أرجع صفحة بدل الملف الصوتي.', 502)
    }
    const headers = new Headers({
      'Content-Type': mime.startsWith('audio/') ? mime : 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
    })
    for (const key of ['content-length', 'content-range']) {
      const value = upstream.headers.get(key)
      if (value) headers.set(key, value)
    }
    if (params.get('download') === '1') {
      headers.set('Content-Disposition',
        `attachment; filename="Alafasy-${edition.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${pad(surah)}.mp3"`)
    }
    return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers })
  } catch {
    return errorResponse('تعذر الاتصال بمصدر الصوت. حاول مرة أخرى.', 502)
  }
}
