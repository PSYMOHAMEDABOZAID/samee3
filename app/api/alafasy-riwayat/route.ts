import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Published edition metadata only. Never substitute one reading for another. */
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

function allowServer(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null
    if (!/^([a-z0-9-]+\.)*mp3quran\.net$/i.test(url.hostname)) return null
    if (url.search || url.hash) return null
    return url.href.endsWith('/') ? url.href : `${url.href}/`
  } catch { return null }
}
function ids(value: unknown): number[] {
  if (typeof value !== 'string') return []
  return [...new Set(value.split(',').map(v => Number(v.trim())).filter(n => Number.isInteger(n) && n >= 1 && n <= 114))].sort((a,b) => a-b)
}
function pad(value: number) { return String(value).padStart(3, '0') }

async function mp3quranEditions(): Promise<Edition[]> {
  const response = await fetch(MP3_ENDPOINT, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(9000) })
  if (!response.ok) throw new Error(`MP3Quran: ${response.status}`)
  const data = (await response.json()) as { reciters?: Mp3Reciter[] }
  const rows = data.reciters || []
  const reader = rows.find(row => Number(row.id) === 123 && /العفاسي/.test(row.name || ''))
  if (!reader) return []
  return (reader.moshaf || []).flatMap(row => {
    const server = allowServer(row.server)
    const surahIds = ids(row.surah_list)
    if (!server || typeof row.id !== 'number' || !Number.isInteger(row.id) || !surahIds.length) return []
    return [{
      id: `mp3-${row.id}`,
      name: row.name || 'مصحف العفاسي',
      source: 'MP3Quran',
      sourceUrl: 'https://www.mp3quran.net/ar/afs',
      server,
      surahIds,
    }]
  })
}

/** Extract only links the publisher actually includes in the selected recitation page.
 * This prevents presenting a partial reading as a full 114-surah mushaf.
 */
async function wayEdition(reading: {slug: string; name: string}): Promise<Edition | null> {
  try {
    const pageUrl = `${WAY_HOME}?recitationSlug=${encodeURIComponent(reading.slug)}`
    const response = await fetch(pageUrl, { next: { revalidate: 21600 }, signal: AbortSignal.timeout(9000) })
    if (!response.ok) return null
    const html = await response.text()
    if (html.length > 4_000_000) return null
    const normalized = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&')
    const pattern = /https:\/\/media\.way2quran\.com\/mishary-alafasy\/([a-z0-9-]+)\/(\d{3})\.mp3/gi
    const matches = [...normalized.matchAll(pattern)]
    const surahIds = [...new Set(matches.filter(m => m[1] === reading.slug).map(m => Number(m[2])).filter(n => n >= 1 && n <= 114))].sort((a,b) => a-b)
    if (!surahIds.length) return null
    return {
      id: `way-${reading.slug}`,
      name: reading.name,
      source: 'الطريق إلى القرآن',
      sourceUrl: pageUrl,
      server: `${WAY_MEDIA}${reading.slug}/`,
      surahIds,
    }
  } catch { return null }
}

let cached: { value: Catalog; expires: number } | null = null
async function getCatalog(): Promise<Catalog> {
  if (cached && Date.now() < cached.expires) return cached.value
  const [official, way] = await Promise.all([
    mp3quranEditions().catch((): Edition[] => []),
    Promise.all(WAY_READINGS.map(wayEdition)),
  ])
  const editions: Edition[] = [...official, ...way.filter((value): value is Edition => value !== null)]
  // A momentary provider outage should not erase the previously loaded catalog.
  if (!editions.length && cached) return cached.value
  const value = { reciter: 'مشاري راشد العفاسي', editions }
  if (editions.length) cached = { value, expires: Date.now() + 15 * 60_000 }
  return value
}

function getEdition(catalog: Catalog, key: string, surah: number): Edition | null {
  return catalog.editions.find(e => e.id === key && e.surahIds.includes(surah)) || null
}
function buildUrl(edition: Edition, surah: number): string {
  // Provider URLs never come from query parameters and use fixed trusted host prefixes.
  return new URL(`${pad(surah)}.mp3`, edition.server).href
}
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams
  const resolve = params.get('resolve')
  const stream = params.get('stream')
  const surahString = params.get('surah')
  if (!resolve && !stream) {
    const result = await getCatalog()
    return result.editions.length
      ? NextResponse.json(result, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300' } })
      : error('مصادر التلاوات غير متاحة مؤقتًا؛ حاول مرة أخرى.', 503)
  }
  const surah = Number(surahString)
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return error('رقم سورة غير صحيح.', 400)
  const editionId = resolve || stream || ''
  const catalog = await getCatalog()
  const edition = getEdition(catalog, editionId, surah)
  if (!edition) return error('هذه السورة غير مدرجة في هذا المصحف.', 404)
  const source = buildUrl(edition, surah)
  const proxyPath = `/api/alafasy-riwayat?stream=${encodeURIComponent(edition.id)}&surah=${surah}`
  if (resolve) return NextResponse.json({ audioUrl: proxyPath, sourceUrl: edition.sourceUrl, directUrl: source }, { headers: { 'Cache-Control': 'no-store' } })

  const range = request.headers.get('range')
  if (range && !/^bytes=\d*-\d*$/.test(range)) return error('مدى الملف غير صحيح.', 416)
  try {
    // Time out only the connection, not the audio stream (long surahs can run for hours).
    const controller = new AbortController()
    const connectTimer = setTimeout(() => controller.abort(), 18000)
    let upstream: Response
    try {
      upstream = await fetch(source, {
        cache: 'no-store',
        headers: range ? { Range: range, Accept: 'audio/mpeg,audio/*' } : { Accept: 'audio/mpeg,audio/*' },
        signal: controller.signal,
        redirect: 'follow',
      })
    } finally { clearTimeout(connectTimer) }
    const finalUrl = new URL(upstream.url)
    const approved = /^([a-z0-9-]+\.)*mp3quran\.net$/i.test(finalUrl.hostname) || finalUrl.hostname === 'media.way2quran.com'
    if (!approved || finalUrl.protocol !== 'https:' || !upstream.ok || !upstream.body) {
      await upstream.body?.cancel().catch(() => {})
      return error('الرابط الصوتي غير متاح حاليًا لدى المصدر الأصلي.', 502)
    }
    const mime = upstream.headers.get('content-type') || ''
    if (mime.includes('text/html') || mime.includes('application/json')) {
      await upstream.body.cancel().catch(() => {})
      return error('المصدر أرجع صفحة بدل الملف الصوتي.', 502)
    }
    const headers = new Headers({
      'Content-Type': mime.startsWith('audio/') ? mime : 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
    })
    for (const header of ['content-length', 'content-range']) {
      const value = upstream.headers.get(header)
      if (value) headers.set(header, value)
    }
    if (params.get('download') === '1') {
      headers.set('Content-Disposition', `attachment; filename="Alafasy-${edition.id.replace(/[^a-zA-Z0-9_-]/g, '')}-${pad(surah)}.mp3"`)
    }
    return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers })
  } catch {
    return error('تعذر الاتصال بمصدر الصوت. تحقّق من الإنترنت ثم أعد المحاولة.', 502)
  }
}
