/**
 * SAMEE3 Adhkar offline: bounded, sequential HTTP Range downloads.
 * Caches only fully downloaded audio, without converting full MP3 files to Blob.
 * Does not delete any existing recordings.
 */
import { isLocalAdhkarMediaPath } from './adhkar-media-path'

export const ADHKAR_AUDIO_CACHE = 'samee3-adhkar-audio-v1'
export const ADHKAR_AUDIO_PLAY_PATH = '/__samee3_adhkar_offline'
const MAX_BYTES = 180 * 1024 * 1024
const CHUNK_BYTES = 512 * 1024
const REQUEST_TIMEOUT_MS = 25000

function checkedURL(url: string): string {
  const resolved = new URL(url, location.origin)
  const local = isLocalAdhkarMediaPath(resolved.pathname) && !resolved.search && !resolved.hash
  const proxy = resolved.pathname === '/api/adhkar-audio' && Boolean(resolved.searchParams.get('url'))
  if (resolved.origin !== location.origin || (!proxy && !local)) {
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const controller = new AbortController()
    const cancel = () => controller.abort()
    signal.addEventListener('abort', cancel, { once: true })
    let timer = setTimeout(cancel, REQUEST_TIMEOUT_MS)
    let transferred = false
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel) }
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: { Range: `bytes=${first}-${last}` },
      })
      if ((response.status === 206 || response.status === 200) && validAudio(response) && response.body) {
        // Retry an interrupted *part*, including body-read failures. Previously
        // a dropped connection restarted the entire long recording three times.
        if (response.status === 206) {
          const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(response.headers.get('Content-Range') || '')
          if (!match || Number(match[1]) !== first || Number(match[2]) > last || Number(match[2]) < first || Number(match[3]) > MAX_BYTES || Number(match[2]) >= Number(match[3])) {
            await response.body.cancel(); throw new Error('الخادم أعاد جزءًا غير مطابق للتسجيل.')
          }
          const expected = Number(match[2]) - first + 1
          const reader = response.body.getReader(), chunks: Uint8Array[] = []
          let received = 0
          try {
            for (;;) {
              const next = await reader.read()
              if (next.done) break
              received += next.value.byteLength
              if (received > expected || received > CHUNK_BYTES) throw new Error('حجم الجزء الصوتي غير صالح.')
              chunks.push(next.value)
            }
          } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
          if (received !== expected) throw new Error('انقطع تحميل جزء من التسجيل؛ أعد المحاولة.')
          return new Response(new Blob(chunks as BlobPart[], { type: 'audio/mpeg' }), { status: 206, headers: response.headers })
        }
        // A host without Range is streamed with an idle timeout, not a deadline
        // for the whole recording. Cancellation also interrupts a stalled read.
        const reader = response.body.getReader()
        transferred = true
        const stream = new ReadableStream<Uint8Array>({
          async pull(output) {
            clearTimeout(timer); timer = setTimeout(cancel, REQUEST_TIMEOUT_MS)
            try {
              const next = await reader.read()
              if (next.done) { finish(); reader.releaseLock(); output.close() }
              else output.enqueue(next.value)
            } catch (error) { finish(); output.error(error) }
          },
          async cancel(reason) { controller.abort(); finish(); await reader.cancel(reason).catch(() => undefined) },
        })
        return new Response(stream, { status: 200, headers: response.headers })
      }
      await response.body?.cancel().catch(() => undefined)
      if (response.status === 400 || response.status === 404 || response.status === 416) {
        throw new Error(`مصدر التسجيل غير متاح (${response.status}).`)
      }
      throw new Error(`تعذر تحميل الصوت (${response.status}).`)
    } catch (error) {
      lastError = controller.signal.aborted && !signal.aborted
        ? new Error('انتهت مهلة تحميل جزء من التسجيل. تحقق من الاتصال وأعد المحاولة.') : error
      if (signal.aborted || attempt === 2) break
    } finally { if (!transferred) finish() }
  }
  throw lastError instanceof Error ? lastError : new Error('فشل اتصال الصوت.')
}

export async function isAdhkarAudioSaved(input: string): Promise<boolean> {
  try {
    const url = checkedURL(input)
    if (!('caches' in window)) return false
    const response = await (await caches.open(ADHKAR_AUDIO_CACHE)).match(url)
    return Boolean(response && response.status === 200 && response.body && response.headers.get('Content-Length') !== '0' && validAudio(response) && !response.headers.has('Content-Range'))
  } catch { return false }
}

export async function downloadAdhkarForOffline(input: string, signal: AbortSignal, progress?: (loaded: number, total: number | null) => void): Promise<void> {
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
  progress?.(offset, total)
  const validator = first.headers.get('ETag') || first.headers.get('Last-Modified')
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
      const nextValidator = response.headers.get('ETag') || response.headers.get('Last-Modified')
      if (validator && nextValidator && validator !== nextValidator) {
        await response.body?.cancel().catch(() => undefined)
        throw new Error('تغير ملف التسجيل أثناء التنزيل. أعد المحاولة لحفظ نسخة متكاملة.')
      }
      const partRange = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(gotRange.trim())
      if (!partRange || Number(partRange[1]) !== offset || Number(partRange[2]) > expectedLast || Number(partRange[3]) !== total) {
        await response.body?.cancel().catch(() => undefined)
        throw new Error('ترتيب أجزاء التسجيل غير صحيح.')
      }
      const chunk = new Uint8Array(await response.arrayBuffer())
      if (chunk.byteLength !== Number(partRange[2]) - offset + 1) throw new Error('جزء من الملف ناقص.')
      offset += chunk.length
      progress?.(offset, total)
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
