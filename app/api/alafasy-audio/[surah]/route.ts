/**
 * SAMEE3 — collected Alafasy MP3 streaming endpoint.
 * This is NOT the multi-riwayat audio manifest route.
 * Supports byte-range seeks needed by Safari/iOS and the visual-ayat trim editor.
 */
import { ALAFASY_COLLECTED_RELEASE } from '@/lib/quran/alafasy-collected'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ surah: string }> }

function audioError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

async function serveAudio(request: Request, context: Context): Promise<Response> {
  const { surah: raw } = await context.params
  const matched = /^(\d{1,3})(?:\.mp3)?$/i.exec(raw)
  if (!matched) return audioError('Invalid surah filename', 400)

  const surah = Number(matched[1])
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
    return audioError('Invalid surah number', 400)
  }

  // Only fixed, release-pinned audio assets — no user-supplied remote hosts.
  const url = `${ALAFASY_COLLECTED_RELEASE}/${String(surah).padStart(3, '0')}.mp3`
  const range = request.headers.get('range')

  // One byte range per request is sufficient for native HTMLAudioElement seeking.
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/i.test(range.trim())) {
    return audioError('Invalid byte range', 416)
  }

  const outgoingHeaders = new Headers({
    Accept: 'audio/mpeg, application/octet-stream;q=0.8',
    'Accept-Encoding': 'identity',
  })
  if (range) outgoingHeaders.set('Range', range)
  const ifRange = request.headers.get('if-range')
  if (range && ifRange) outgoingHeaders.set('If-Range', ifRange)

  try {
    const upstream = await fetch(url, {
      method: request.method,
      headers: outgoingHeaders,
      cache: 'no-store',
      redirect: 'follow',
      signal: request.signal,
    })

    if (upstream.status === 416) {
      const headers = new Headers({ 'Cache-Control': 'no-store' })
      const contentRange = upstream.headers.get('content-range')
      if (contentRange) headers.set('Content-Range', contentRange)
      await upstream.body?.cancel().catch(() => {})
      return new Response(null, { status: 416, headers })
    }

    if (upstream.status !== 200 && upstream.status !== 206) {
      await upstream.body?.cancel().catch(() => {})
      return audioError(
        upstream.status === 404 ? 'Audio file not found' : 'Audio source temporarily unavailable',
        upstream.status === 404 ? 404 : 502
      )
    }

    const headers = new Headers({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    })

    // Preserve actual transport metadata. Do not invent Content-Range or
    // Content-Length when the remote server did not provide them.
    for (const field of [
      'content-length', 'content-range', 'accept-ranges',
      'last-modified', 'etag', 'content-encoding',
    ]) {
      const value = upstream.headers.get(field)
      if (value) headers.set(field, value)
    }

    // GitHub's CDN often supports seeking; advertise ranges only if upstream
    // actually provides that capability. A 206 response always proves it.
    if (upstream.status === 206 && !headers.has('accept-ranges')) {
      headers.set('Accept-Ranges', 'bytes')
    }

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch (error) {
    if (request.signal.aborted) return audioError('Request cancelled', 499)
    console.error('[samee3] Collected Alafasy audio request failed', error)
    return audioError('Could not load collected Alafasy recording', 502)
  }
}

export async function GET(request: Request, context: Context): Promise<Response> {
  return serveAudio(request, context)
}

export async function HEAD(request: Request, context: Context): Promise<Response> {
  return serveAudio(request, context)
}