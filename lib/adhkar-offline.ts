/**
 * SAMEE3 Adhkar offline: bounded, sequential HTTP Range downloads.
 * Caches only fully downloaded audio, without converting full MP3 files to Blob.
 * Does not delete any existing recordings.
 */
export const ADHKAR_AUDIO_CACHE = 'samee3-adhkar-audio-v1'
export const ADHKAR_AUDIO_PLAY_PATH = '/__samee3_adhkar_offline'
const MAX_BYTES = 180 * 1024 * 1024
const CHUNK_BYTES = 1024 * 1024

function checkedURL(url: string): string {
  if (!url.startsWith('/api/adhkar-audio?url=')) {
    throw new Error('رابط الأذكار غير صالح.')
  }
  const resolved = new URL(url, location.origin)
  if (resolved.origin !== location.origin || resolved.pathname !== '/api/adhkar-audio') {
    throw new Error('رابط التسجيل يجب أن يكون من داخل سميع.')
  }
  return resolved.href
}

function validAudio(response: Response): boolean {
  const type = (response.headers.get('Content-Type') || '').toLowerCase()
  return type.startsWith('audio/') || type.includes('octet-stream') || type.includes('x-download') || type.includes('force-download')
}

function declaredLength(response: Response): number | null {
  const raw = response.headers.get('Content-Length')
  if (!raw || !/^\d+$/.test(raw)) return null
  const size = Number(raw)
  return Number.isSafeInteger(size) && size > 0 ? size : null
}

async function saveResponse(cache: Cache, url: string, response: Response, signal: AbortSignal, total: number | null): Promise<void> {
  if (!response.body) throw new Error('المصدر لا يدعم نقل الصوت.')
  let loaded = 0
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      loaded += chunk.byteLength
      if (loaded > MAX_BYTES) throw new Error('حجم الملف أكبر من الحد الآمن.')
      controller.enqueue(chunk)
    },
    flush() {
      if (total !== null && loaded !== total) throw new Error('التسجيل غير مكتمل. أعد المحاولة.')
    },
  }), { signal })
  const headers = new Headers({ 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes' })
  if (total !== null) headers.set('Content-Length', String(total))
  // Cache.put consumes the stream and resolves only after writing finishes.
  await cache.put(url, new Response(body, { status: 200, headers }))
}

async function fetchPart(url: string, first: number, last: number, signal: AbortSignal): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal,
        headers: { Range: `bytes=${first}-${last}` },
      })
      if ((response.status === 206 || response.status === 200) && validAudio(response)) return response
      await response.body?.cancel().catch(() => undefined)
      if (response.status === 400 || response.status === 404 || response.status === 416) {
        throw new Error(`مصدر التسجيل غير متاح (${response.status}).`)
      }
      throw new Error(`تعذر تحميل الصوت (${response.status}).`)
    } catch (error) {
      lastError = error
      if (signal.aborted || attempt === 1) break
    }
  }
  throw lastError instanceof Error ? lastError : new Error('فشل اتصال الصوت.')
}

export async function isAdhkarAudioSaved(input: string): Promise<boolean> {
  try {
    const url = checkedURL(input)
    if (!('caches' in window)) return false
    const response = await (await caches.open(ADHKAR_AUDIO_CACHE)).match(url)
    return Boolean(response && response.status === 200 && validAudio(response) && !response.headers.has('Content-Range'))
  } catch { return false }
}

export async function downloadAdhkarForOffline(input: string, signal: AbortSignal): Promise<void> {
  if (!('caches' in window)) throw new Error('التخزين دون إنترنت غير مدعوم هنا.')
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const url = checkedURL(input)
  const cache = await caches.open(ADHKAR_AUDIO_CACHE)
  if (await isAdhkarAudioSaved(input)) return

  // The initial request asks only for one MiB. Per-request Range allows a
  // Vercel function to finish without waiting for a very long complete MP3.
  const first = await fetchPart(url, 0, CHUNK_BYTES - 1, signal)
  if (first.status === 200) {
    const length = declaredLength(first)
    if (length !== null && length > MAX_BYTES) {
      await first.body?.cancel().catch(() => undefined)
      throw new Error('ملف الأذكار كبير جدًا.')
    }
    await saveResponse(cache, url, first, signal, length)
    if (!await isAdhkarAudioSaved(input)) throw new Error('لم يتأكد حفظ التسجيل.')
    return
  }

  const range = first.headers.get('Content-Range') || ''
  const match = /^bytes\s+0-(\d+)\/(\d+)$/i.exec(range)
  if (!match) {
    await first.body?.cancel().catch(() => undefined)
    throw new Error('الخادم لم يرجع حجم التسجيل الكامل.')
  }
  const end = Number(match[1])
  const total = Number(match[2])
  if (!Number.isSafeInteger(total) || total < 1 || total > MAX_BYTES || end < 0 || end >= total) {
    await first.body?.cancel().catch(() => undefined)
    throw new Error('حجم التسجيل غير مدعوم.')
  }
  const firstBytes = new Uint8Array(await first.arrayBuffer())
  if (firstBytes.length !== end + 1) throw new Error('أول جزء من التسجيل غير مكتمل.')

  let offset = end + 1
  let emittedFirst = false
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (!emittedFirst) {
        emittedFirst = true
        controller.enqueue(firstBytes)
        if (offset >= total) controller.close()
        return
      }
      if (offset >= total) { controller.close(); return }
      const expectedLast = Math.min(total - 1, offset + CHUNK_BYTES - 1)
      const response = await fetchPart(url, offset, expectedLast, signal)
      if (response.status !== 206) {
        await response.body?.cancel().catch(() => undefined)
        throw new Error('المصدر توقف عن دعم تحميل الأجزاء.')
      }
      const gotRange = response.headers.get('Content-Range') || ''
      const expectedRange = `bytes ${offset}-${expectedLast}/${total}`
      if (gotRange.trim() !== expectedRange) {
        await response.body?.cancel().catch(() => undefined)
        throw new Error('ترتيب أجزاء التسجيل غير صحيح.')
      }
      const chunk = new Uint8Array(await response.arrayBuffer())
      if (chunk.byteLength !== expectedLast - offset + 1) throw new Error('جزء من الملف ناقص.')
      offset += chunk.length
      controller.enqueue(chunk)
      if (offset >= total) controller.close()
    },
  })
  const headers = new Headers({
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(total),
    'Accept-Ranges': 'bytes',
  })
  await cache.put(url, new Response(stream, { status: 200, headers }))
  if (!await isAdhkarAudioSaved(input)) throw new Error('تعذر التأكد من حفظ الصوت.')
}

/** Use a Service Worker stream instead of constructing a massive Blob on iPhone. */
export async function cachedAdhkarPlaybackUrl(input: string): Promise<string | null> {
  if (!await isAdhkarAudioSaved(input)) return null
  if (navigator.serviceWorker?.controller) {
    return `${ADHKAR_AUDIO_PLAY_PATH}?url=${encodeURIComponent(checkedURL(input))}`
  }
  // Before the Service Worker takes control: small files only.
  try {
    const response = await (await caches.open(ADHKAR_AUDIO_CACHE)).match(checkedURL(input))
    const size = response ? declaredLength(response) : null
    if (!response || !size || size > 8 * 1024 * 1024) return null
    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } catch { return null }
}
