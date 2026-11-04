import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const HOSTS = new Set(['assets.usul.ai','d1.islamhouse.com','shamela.org','archive.org','www.archive.org','books.islamway.net','files.islamhouse.com'])
function allowed(value: string): URL | null {
  try {
    const url = new URL(value)
    if (value.length > 3000 || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return null
    return HOSTS.has(url.hostname) || /^ia\d+\.us\.archive\.org$/.test(url.hostname) || /^dn\d+\.ca\.archive\.org$/.test(url.hostname) ? url : null
  } catch { return null }
}
async function proxy(request: NextRequest) {
  const initial = allowed(request.nextUrl.searchParams.get('url') || '')
  if (!initial) return NextResponse.json({ error: 'مصدر PDF غير مسموح. اختر الملف من جهازك.' }, { status: 400 })
  let url: URL = initial
  const range = request.headers.get('range')
  const parts = range?.match(/^bytes=(\d*)-(\d*)$/)
  if (range && (!parts || (!parts[1] && !parts[2]) || (parts[1] && !Number.isSafeInteger(Number(parts[1]))) || (parts[2] && (!Number.isSafeInteger(Number(parts[2])) || (parts[1] && Number(parts[2]) < Number(parts[1])))))) return new NextResponse(null, { status: 416 })
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => controller.abort()
  const reset = () => { clearTimeout(timer); timer = setTimeout(cancel, 25000) }
  const clean = () => { clearTimeout(timer); request.signal.removeEventListener('abort', cancel) }
  request.signal.addEventListener('abort', cancel, { once: true }); if (request.signal.aborted) cancel()
  let response: Response | null = null
  try {
    for (let hop = 0; hop <= 4; hop++) {
      reset()
      const referer = url.hostname === 'shamela.org' ? `https://shamela.org/pdf/${url.pathname.split('/').at(-1)?.replace(/_gen\.pdf$/, '')}` : url.origin + '/'
      const headers = new Headers({ Referer: referer, 'User-Agent': 'Mozilla/5.0 (compatible; SAMEE3)', Accept: 'application/pdf', 'Accept-Encoding': 'identity' })
      if (range) headers.set('Range', range)
      for (const key of ['if-range','if-none-match','if-modified-since']) { const value = request.headers.get(key); if (value) headers.set(key, value) }
      response = await fetch(url, { method: request.method, headers, signal: controller.signal, redirect: 'manual', cache: 'no-store' })
      if (![301,302,303,307,308].includes(response.status)) break
      const location: string | null = response.headers.get('location'); await response.body?.cancel()
      const next: URL | null = location ? allowed(new URL(location, url).href) : null
      if (!next || hop === 4) throw new Error('Untrusted redirect')
      url = next
    }
    if (!response) throw new Error('No response')
    const headers = new Headers({ 'Cache-Control': 'private, max-age=3600, no-transform', 'Content-Type': 'application/pdf', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `${request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="samee3-book.pdf"` })
    for (const key of ['content-length','content-range','accept-ranges','etag','last-modified']) { const value = response.headers.get(key); if (value) headers.set(key, value) }
    if ([304,416].includes(response.status)) { clean(); await response.body?.cancel(); headers.delete('content-length'); return new NextResponse(null, { status: response.status, headers }) }
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    const total = Number(response.headers.get('content-range')?.split('/')[1] || response.headers.get('content-length') || 0)
    if (![200,206].includes(response.status) || !['application/pdf','application/octet-stream','binary/octet-stream'].includes(mime) || total > 1024 * 1024 * 1024 || !['identity',''].includes(response.headers.get('content-encoding') || '')) throw new Error('Invalid PDF response')
    if (response.status === 206 && !/^bytes \d+-\d+\/\d+$/.test(headers.get('content-range') || '')) throw new Error('Invalid range response')
    if (request.method === 'HEAD') { clean(); await response.body?.cancel(); return new NextResponse(null, { status: response.status, headers }) }
    if (!response.body) throw new Error('Empty PDF')
    const reader = response.body.getReader(); let bytes = 0
    const stream = new ReadableStream<Uint8Array>({
      async pull(output) {
        try {
          reset(); const item = await reader.read()
          if (item.done) { clean(); output.close(); return }
          bytes += item.value.byteLength
          if (bytes > 1024 * 1024 * 1024) throw new Error('File too large')
          output.enqueue(item.value)
        } catch (error) { clean(); cancel(); output.error(error) }
      },
      async cancel() { clean(); cancel(); await reader.cancel().catch(() => {}) },
    })
    return new NextResponse(stream, { status: response.status, headers })
  } catch {
    clean(); cancel(); await response?.body?.cancel().catch(() => {})
    return NextResponse.json({ error: 'تعذر جلب نسخة PDF من الناشر. أعد المحاولة أو اختر نسخة من جهازك.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
export const GET = proxy
export const HEAD = proxy
