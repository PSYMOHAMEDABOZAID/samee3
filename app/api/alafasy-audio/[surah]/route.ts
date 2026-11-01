
import { ALAFASY_COLLECTED_RELEASE } from '@/lib/quran/alafasy-collected'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ surah: string }>
}

/** The player requests /api/alafasy-audio/001.mp3 ... 114.mp3. */
function getAudioFilename(value: string): string | null {
  const match = /^(\d{3})\.mp3$/.exec(value)
  if (!match) return null

  const surah = Number(match[1])
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null

  return match[0]
}

/** Stream the exact collected recording, including byte-range requests. */
export async function GET(
  request: Request,
  { params }: RouteContext
): Promise<Response> {
  const { surah } = await params
  const filename = getAudioFilename(surah)

  if (!filename) {
    return new Response('Audio not found', { status: 404 })
  }

  const upstreamHeaders = new Headers()
  const range = request.headers.get('range')

  if (range) {
    // Browsers and the offline downloader use single HTTP byte ranges.
    if (!/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) {
      return new Response('Invalid audio range', {
        status: 416,
        headers: { 'Accept-Ranges': 'bytes' },
      })
    }

    upstreamHeaders.set('Range', range)
    const ifRange = request.headers.get('if-range')
    if (ifRange) upstreamHeaders.set('If-Range', ifRange)
  }

  try {
    const source = `${ALAFASY_COLLECTED_RELEASE}/${filename}`
    const upstream = await fetch(source, {
      method: 'GET',
      headers: upstreamHeaders,
      redirect: 'follow',
      cache: 'no-store',
      signal: request.signal,
    })

    if (upstream.status === 416) {
      const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      })
      const contentRange = upstream.headers.get('content-range')
      if (contentRange) headers.set('Content-Range', contentRange)
      await upstream.body?.cancel().catch(() => {})
      return new Response(null, { status: 416, headers })
    }

    if (upstream.status !== 200 && upstream.status !== 206) {
      await upstream.body?.cancel().catch(() => {})
      return new Response('Collected audio is temporarily unavailable', {
        status: upstream.status === 404 ? 404 : 502,
      })
    }

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase()
    if (/text\/html|application\/(?:json|xml)/.test(contentType) || !upstream.body) {
      await upstream.body?.cancel().catch(() => {})
      return new Response('Invalid audio response', { status: 502 })
    }

    const headers = new Headers({
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })

    // Preserve lengths and validators so the player can seek and downloads can resume.
    for (const name of ['Content-Length', 'Content-Range', 'ETag', 'Last-Modified']) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }

    // Stream instead of buffering an entire surah in Vercel memory.
    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch (error) {
    console.error('Alafasy collected audio proxy failed:', error)
    return new Response('Audio service temporarily unavailable', {
      status: 503,
    })
  }
}
