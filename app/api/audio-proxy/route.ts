import { LIBRARY_MEDIA_HOSTS } from '@/lib/audio-catalog'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * SAMEE3 stable audio proxy — keeps all existing provider, Range, HEAD,
 * redirect and error handling while reducing uncached origin responses.
 * Alafasy collected audio does NOT use this route and remains untouched.
 */
const TRUSTED_HOSTS = new Set([
  ...LIBRARY_MEDIA_HOSTS,
  'd1.islamhouse.com',
  'archive.org',
  'www.archive.org',
  'server03.quran-uni.com',
])
const MAX_REDIRECTS = 4
const CONNECT_TIMEOUT_MS = 15_000
const MAX_URL_LENGTH = 4096
const CACHE_MAX_BYTES = 9_000_000 // Vercel cache only accepts bodies <= 10 MB.
const AUDIO_TYPES = new Set([
  'application/octet-stream', 'binary/octet-stream', 'application/ogg',
  'video/mp4', 'video/webm',
])

function validSource(value: string): URL | null {
  if (!value || value.length > MAX_URL_LENGTH) return null
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.port !== '' || url.username ||
      url.password || url.hash || host.endsWith('.')) return null
    if (!TRUSTED_HOSTS.has(host) && !/^ia\d+\.us\.archive\.org$/.test(host)) return null
    return url
  } catch { return null }
}

function validRange(value: string | null): boolean {
  if (!value) return true
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  return value.length <= 100 && Boolean(match && (match[1] || match[2]))
}

function isAudioResponse(response: Response, url: URL): boolean {
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (type) return type.startsWith('audio/') || AUDIO_TYPES.has(type)
  return /\.(?:mp3|m4a|aac|ogg|opus|wav|flac|webm|mp4)$/i.test(url.pathname)
}

function copyHeader(from: Headers, to: Headers, name: string): void {
  const value = from.get(name)
  if (value !== null) to.set(name, value)
}

function upstreamRequestHeaders(url: URL, range: string | null): Headers {
  const headers = new Headers({
    Accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.3',
    'Accept-Encoding': 'identity',
    'User-Agent': 'SAMEE3/1.0 audio proxy',
  })
  if (range) headers.set('Range', range)
  if (url.hostname === 'lecture-h9afefaff7fjc2h3.z01.azurefd.net' ||
    url.hostname === 'audio.islamweb.net' || url.hostname === 'audio.islamweb.org') {
    headers.set('Referer', 'https://audio.islamweb.net/')
    headers.set('Origin', 'https://audio.islamweb.net')
    headers.set('User-Agent', 'Mozilla/5.0 (compatible; SAMEE3 Audio)')
  }
  if (url.hostname === 'd1.islamhouse.com') {
    headers.set('Referer', 'https://islamhouse.com/')
    headers.set('Origin', 'https://islamhouse.com')
  }
  return headers
}

/** Limit waiting for response headers, not the duration of the audio stream. */
async function fetchHeaders(
  url: URL, method: 'GET' | 'HEAD', range: string | null, requestSignal: AbortSignal,
): Promise<Response> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timeout = setTimeout(abort, CONNECT_TIMEOUT_MS)
  requestSignal.addEventListener('abort', abort, { once: true })
  try {
    if (requestSignal.aborted) controller.abort()
    return await fetch(url.href, {
      method, headers: upstreamRequestHeaders(url, range), redirect: 'manual',
      credentials: 'omit', cache: 'no-store', signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
    requestSignal.removeEventListener('abort', abort)
  }
}

async function discard(response: Response): Promise<void> {
  try { await response.body?.cancel() } catch { /* already closed */ }
}

type UpstreamResult =
  | { ok: true; response: Response; url: URL }
  | { ok: false; status: number; error: string }

async function connectToAudio(
  initialUrl: URL, method: 'GET' | 'HEAD', range: string | null, signal: AbortSignal,
): Promise<UpstreamResult> {
  let current = initialUrl
  const visited = new Set<string>()
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (visited.has(current.href)) return {
      ok: false, status: 502, error: 'تم اكتشاف حلقة تحويل في رابط الصوت.',
    }
    visited.add(current.href)
    const response = await fetchHeaders(current, method, range, signal)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await discard(response)
      if (!location || hop === MAX_REDIRECTS) return {
        ok: false, status: 502, error: 'عدد تحويلات مصدر الصوت أكبر من المسموح.',
      }
      let next: URL | null = null
      try { next = validSource(new URL(location, current).href) } catch { next = null }
      if (!next) return {
        ok: false, status: 502, error: 'حوّل مصدر الصوت الطلب إلى عنوان غير مسموح.',
      }
      current = next
      continue
    }
    return { ok: true, response, url: current }
  }
  return { ok: false, status: 502, error: 'تعذر الوصول إلى ملف الصوت.' }
}

/**
 * Only small, truly public, complete MP3s can be cached at the CDN.
 * Range/206 requests must NEVER enter this cache — their bytes vary by Range.
 * The upstream's private/no-store and Set-Cookie directives also win.
 * No cacheable response depends on an Authorization/Cookie request header.
 */
function cacheControlFor(
  request: NextRequest, upstream: Response, range: string | null,
): string {
  if (request.method !== 'GET' || range || upstream.status !== 200 || request.headers.has('authorization') ||
    request.headers.has('cookie') || upstream.headers.has('set-cookie')) return 'private, no-store'
  const policy = (upstream.headers.get('cache-control') || '').toLowerCase()
  if (/(?:private|no-store|no-cache)/.test(policy)) return 'private, no-store'
  const sizeRaw = upstream.headers.get('content-length')
  if (!sizeRaw || !/^\d+$/.test(sizeRaw)) return 'private, no-store'
  const size = Number(sizeRaw)
  if (!Number.isSafeInteger(size) || size <= 0 || size > CACHE_MAX_BYTES) return 'private, no-store'
  // Public static publisher audio; edge TTL saves repeated origin transfers.
  return 'public, max-age=120, s-maxage=21600, stale-while-revalidate=86400'
}

async function proxyAudio(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get('url')?.trim() || ''
  const source = validSource(raw)
  if (source?.hostname === 'lecture-h9afefaff7fjc2h3.z01.azurefd.net') {
    source.searchParams.set('download', '1')
  }
  if (!source) return NextResponse.json({
    error: raw ? 'رابط الصوت غير مسموح أو غير صالح.' : 'رابط الصوت مطلوب.',
  }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  const range = request.headers.get('range')
  if (!validRange(range)) return NextResponse.json({
    error: 'صيغة طلب الجزء الصوتي Range غير صالحة.',
  }, { status: 416, headers: { 'Cache-Control': 'no-store' } })
  const method: 'GET' | 'HEAD' = request.method === 'HEAD' ? 'HEAD' : 'GET'
  try {
    const upstream = await connectToAudio(source, method, range, request.signal)
    if (!upstream.ok) return NextResponse.json({ error: upstream.error }, {
      status: upstream.status, headers: { 'Cache-Control': 'no-store' },
    })
    const { response, url } = upstream
    if (response.status === 416) {
      const headers = new Headers({ 'Cache-Control': 'no-store' })
      copyHeader(response.headers, headers, 'Content-Range')
      copyHeader(response.headers, headers, 'Accept-Ranges')
      await discard(response)
      return new NextResponse(null, { status: 416, headers })
    }
    if (response.status !== 200 && response.status !== 206) {
      const notFound = response.status === 404
      await discard(response)
      return NextResponse.json({ error: notFound
        ? 'التسجيل الصوتي غير موجود في المصدر.'
        : 'تعذر جلب التسجيل الصوتي من المصدر.' }, {
        status: notFound ? 404 : 502, headers: { 'Cache-Control': 'no-store' },
      })
    }
    const encoding = (response.headers.get('content-encoding') || 'identity').toLowerCase()
    if (!isAudioResponse(response, url) || encoding !== 'identity') {
      await discard(response)
      return NextResponse.json({ error: 'الاستجابة ليست ملفًا صوتيًا صالحًا للتشغيل.' }, {
        status: 502, headers: { 'Cache-Control': 'no-store' },
      })
    }
    const headers = new Headers({
      'Cache-Control': cacheControlFor(request, response, range),
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    })
    for (const name of [
      'Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges',
      'ETag', 'Last-Modified',
    ]) copyHeader(response.headers, headers, name)
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'audio/mpeg')
    // Even a misbehaving provider may answer 206 without a Range request:
    // cacheControlFor rejects it by status, preventing mixed partial/full caches.
    if (method === 'HEAD') {
      await discard(response)
      return new NextResponse(null, { status: response.status, headers })
    }
    return new NextResponse(response.body, { status: response.status, headers })
  } catch (error) {
    const interrupted = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json({ error: interrupted
      ? 'انتهت مهلة الاتصال بمصدر الصوت أو أُلغي الطلب.'
      : 'حدث خطأ أثناء الاتصال بمصدر الصوت.' }, {
      status: interrupted ? 504 : 502, headers: { 'Cache-Control': 'no-store' },
    })
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return proxyAudio(request)
}

export async function HEAD(request: NextRequest): Promise<NextResponse> {
  return proxyAudio(request)
}
