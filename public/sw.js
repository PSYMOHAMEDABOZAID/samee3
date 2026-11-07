// SAMEE3_AUDIO_LIBRARY_STABLE_V1: update service-worker code; never delete audio caches.
try { importScripts('/sw-build.js') } catch (_) { /* offline first installation */ }
const SW_VERSION = 'samee3-sw-v18-' + (self.SAMEE3_BUILD_ID || 'fallback')

const SHELL_CACHE = `${SW_VERSION}-shell`
const NAV_CACHE = `${SW_VERSION}-navigation`
const ASSET_CACHE = `${SW_VERSION}-assets`
const RSC_CACHE = `${SW_VERSION}-rsc`

// These names are shared with the existing app.
const MUSHAF_PAGE_CACHE = 'samee3-mushaf-pages-v2'
const OLD_IMAGE_CACHE = 'samee3-v3-riwaya-images'
const AUDIO_CACHE = 'samee3-audio-v2'

const OLD_AUDIO_CACHES = [
  'samee3-quran-audio-v1',
  'samee3-v2-audio',
  'samee-audio-v2',
]

// Only public pages are eligible for offline HTML caching.
const PUBLIC_ROUTES = new Set([
  '/',
  '/mushaf',
  '/offline',
  '/offline/manage',
  '/offline/test',
  '/audio',
  '/audio/alafasy-riwayat',
  '/surahs',
  '/hadith',
  '/adhkar',
  '/adhkar/recordings',
  '/prayer',
  '/islamic-library',
  '/index',
  '/notifications',
  '/notifications/hadith',
])

const INSTALL_ROUTES = [
  '/',
  '/mushaf',
  '/offline',
  '/audio',
  '/offline/manage',
]

const INSTALL_FILES = [
  '/manifest.json',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/data/adhkar.json',
  '/fonts/UthmanicHafs-v-3.0.ttf',
  '/fonts/Tajawal-Regular.ttf',
  '/fonts/Tajawal-Bold.ttf',
  '/fonts/Amiri-Regular.ttf',
  '/fonts/AmiriQuran-Regular.ttf',
  '/fonts/ArefRuqaa-Regular.ttf',
  '/fonts/sousi-source.ttf',
  '/fonts/bazzi-source.otf',
]

const RIWAYAT = new Set([
  'hafs',
  'warsh',
  'qalun',
  'douri',
  'shubah',
  'sousi',
  'bazzi',
])

const MUSHAF_ENDPOINTS = new Set([
  '/api/quran',
  '/api/mushaf-svg',
  '/api/mushaf-riwaya-image',
])

function pathOf(url) {
  const path = url.pathname.replace(/\/+$/, '')
  return path || '/'
}

function isSameOrigin(url) {
  return url.origin === self.location.origin
}

function isPublicPath(url) {
  return (
    isSameOrigin(url) &&
    (PUBLIC_ROUTES.has(pathOf(url)) || /^\/islamic-library\/(?:level|book)\//.test(pathOf(url)) || pathOf(url) === '/adhkar/read')
  )
}

function isRscRequest(request, url) {
  return (
    request.headers.get('RSC') === '1' ||
    request.headers
      .get('Accept')
      ?.includes('text/x-component') ||
    url.searchParams.has('_rsc')
  )
}

function isPrivateRequest(request, url) {
  const path = pathOf(url)

  return (
    request.headers.has('Authorization') ||
    /^(\/admin|\/profile|\/messages|\/auth)(\/|$)/.test(path) ||
    /^(\/api|\/_next\/image)(\/|$)/.test(path)
  )
}

function canStore(response, category) {
  if (
    !response ||
    !response.ok ||
    response.type === 'opaque'
  ) {
    return false
  }

  if (response.headers.has('Set-Cookie')) {
    return false
  }

  const control = (
    response.headers.get('Cache-Control') || ''
  ).toLowerCase()

  if (/(?:no-store|private)/.test(control)) {
    return false
  }

  const mime = (
    response.headers.get('Content-Type') || ''
  ).toLowerCase()

  if (category === 'html') {
    return mime.includes('text/html')
  }

  if (category === 'rsc') {
    return mime.includes('text/x-component')
  }

  if (category === 'json') {
    return mime.includes('json')
  }

  if (category === 'image') {
    return mime.startsWith('image/')
  }

  return true
}

async function storeIfSafe(
  cache,
  key,
  response,
  category,
) {
  if (!canStore(response, category)) {
    return
  }

  try {
    await cache.put(
      key,
      response.clone(),
    )
  } catch (error) {
    // Do not erase existing Quran downloads
    // when the device is low on storage.
    console.warn(
      'SAMEE3: cache write skipped.',
      error,
    )
  }
}

async function getFromCaches(
  cacheNames,
  key,
) {
  for (const name of cacheNames) {
    try {
      const cache = await caches.open(name)
      const result = await cache.match(key)

      if (result) return result
    } catch {
      // Continue looking in other caches.
    }
  }

  return null
}

function isQuranPageRequest(request, url) {
  if (
    request.method !== 'GET' ||
    !isSameOrigin(url)
  ) {
    return false
  }

  if (!MUSHAF_ENDPOINTS.has(pathOf(url))) {
    return false
  }

  if (!RIWAYAT.has(url.searchParams.get('riwaya'))) {
    return false
  }

  if (pathOf(url) === '/api/quran' && url.searchParams.get('mode') === 'index') {
    return url.searchParams.get('v') === '1'
  }

  const number = Number(
    url.searchParams.get('page'),
  )

  return (
    Number.isInteger(number) &&
    number >= 1 &&
    number <= 604
  )
}

// ========================================
// Quran page storage
// ========================================

async function serveQuranPage(request, url) {
  const names =
    pathOf(url) === '/api/mushaf-riwaya-image'
      ? [MUSHAF_PAGE_CACHE, OLD_IMAGE_CACHE]
      : [MUSHAF_PAGE_CACHE]

  const saved = await getFromCaches(
    names,
    request,
  )

  if (saved) {
    return saved
  }

  const response = await fetch(request)

  const category =
    pathOf(url) === '/api/mushaf-riwaya-image'
      ? 'image'
      : 'json'

  try {
    const cache = await caches.open(MUSHAF_PAGE_CACHE)
    await storeIfSafe(cache, request, response, category)
  } catch { /* Storage restrictions must not break online reading. */ }

  return response
}

// ========================================
// Quran audio storage
// ========================================

function allowAudioHost(url) {
  const host = url.hostname.toLowerCase()

  return (
    url.protocol === 'https:' &&
    (
      host === 'mp3quran.net' ||
      host.endsWith('.mp3quran.net')
    )
  )
}

function isQuranAudio(request, url) {
  return (
    request.method === 'GET' &&
    allowAudioHost(url) &&
    (
      /\.mp3$/i.test(url.pathname) ||
      request.destination === 'audio'
    )
  )
}

// SAMEE3_AUDIO_STABILITY_2026_11
const savedAudioLengths = new Map()
async function cachedAudioRange(response, rangeHeader, reload, key) {
  // Older downloads did not retain Content-Length. Count a disk-backed stream
  // once, then reopen it; never create a complete long-surah ArrayBuffer/Blob.
  if (!response.headers.get('Content-Length') && reload && response.body) {
    let size = savedAudioLengths.get(key)
    if (!size) {
      const counter = response.body.getReader()
      size = 0
      try { while (true) { const next = await counter.read(); if (next.done) break; size += next.value.byteLength } }
      finally { counter.releaseLock() }
      if (size > 0) { if (savedAudioLengths.size > 500) savedAudioLengths.clear(); savedAudioLengths.set(key, size) }
    } else { await response.body.cancel().catch(() => {}) }
    response = await reload()
    if (!response) return new Response('Audio not saved', { status: 404 })
    if (size > 0) { const headers = new Headers(response.headers); headers.set('Content-Length', String(size)); response = new Response(response.body, { headers }) }
  }
  const lengthHeader = response.headers.get('Content-Length')

  const total =
    lengthHeader && /^\d+$/.test(lengthHeader)
      ? Number(lengthHeader)
      : 0

  const match = /^bytes=(\d*)-(\d*)$/i.exec(
    rangeHeader.trim()
  )

  if (
    !total ||
    !Number.isSafeInteger(total) ||
    !match ||
    (!match[1] && !match[2]) ||
    !response.body
  ) {
    return response
  }

  let start = match[1]
    ? Number(match[1])
    : Math.max(0, total - Number(match[2]))

  let end = match[2] && match[1]
    ? Number(match[2])
    : total - 1

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= total ||
    end < start
  ) {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': 'bytes */' + total,
      },
    })
  }

  end = Math.min(end, total - 1)

  const reader = response.body.getReader()

  let position = 0
  let finished = false

  const stream = new ReadableStream({
    async pull(controller) {
      if (finished) return

      try {
        while (true) {
          const next = await reader.read()

          if (next.done) {
            finished = true
            if (position <= end) controller.error(new Error('Saved recording is incomplete'))
            else controller.close()
            return
          }

          const bytes = next.value
          const from = position
          const to = from + bytes.byteLength

          position = to

          if (to <= start) continue

          const low = Math.max(0, start - from)

          const high = Math.min(
            bytes.byteLength,
            end - from + 1
          )

          if (high > low) {
            controller.enqueue(
              bytes.subarray(low, high)
            )
          }

          if (to > end) {
            finished = true
            controller.close()

            void reader.cancel().catch(
              () => undefined
            )
          }

          return
        }
      } catch (error) {
        finished = true
        controller.error(error)
      }
    },

    cancel(reason) {
      finished = true
      return reader.cancel(reason)
    },
  })

  return new Response(stream, {
    status: 206,
    headers: {
      'Content-Type':
        response.headers.get('Content-Type') ||
        'audio/mpeg',

      'Accept-Ranges': 'bytes',

      'Content-Range':
        'bytes ' + start + '-' + end + '/' + total,

      'Content-Length': String(
        end - start + 1
      ),
    },
  })
}

// Saved Alafasy readings are deliberately kept in their existing cache name.
// Streaming them via the SW keeps large offline MP3s out of the page's JS heap.
const RIWAYAT_AUDIO_CACHE = 'samee3-riwayat-audio-v1'
async function serveSavedRiwayatAudio(request) {
  try {
    const cache = await caches.open(RIWAYAT_AUDIO_CACHE)
    const key = new URL(request.url).pathname
    const saved = await cache.match(key)
    if (!saved) return new Response('Audio not saved', { status: 404 })
    const range = request.headers.get('Range')
    return range && saved.type !== 'opaque'
      ? cachedAudioRange(saved, range, () => cache.match(key), key)
      : saved
  } catch {
    return new Response('Saved audio unavailable', { status: 503 })
  }
}
async function serveQuranAudio(request) {
  const cached = await getFromCaches(
    [AUDIO_CACHE, ...OLD_AUDIO_CACHES],
    request.url
  )

  if (cached) {
    const range = request.headers.get('Range')

    if (range && cached.type !== 'opaque') {
      return cachedAudioRange(cached, range, () => getFromCaches([AUDIO_CACHE, ...OLD_AUDIO_CACHES], request.url), request.url)
    }

    return cached
  }

  // Only explicitly downloaded audio is stored.
  return fetch(request)
}

async function saveAudioOnRequest(urlString) {
  let url

  try {
    url = new URL(urlString)
  } catch {
    throw new Error('Invalid audio URL')
  }

  if (
    !allowAudioHost(url) ||
    !/\.mp3$/i.test(url.pathname)
  ) {
    throw new Error(
      'رابط الصوت غير مسموح به.',
    )
  }

  const cache = await caches.open(
    AUDIO_CACHE,
  )

  const existing = await getFromCaches(
    [
      AUDIO_CACHE,
      ...OLD_AUDIO_CACHES,
    ],
    url.href,
  )

  if (existing) return

  try {
    const response = await fetch(
      url.href,
      {
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
      },
    )

    if (
      response.ok &&
      response.status === 200
    ) {
      await cache.put(
        url.href,
        response,
      )
      return
    }
  } catch {
    // Some audio servers reject CORS.
  }

  const opaque = await fetch(
    url.href,
    {
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'no-store',
    },
  )

  if (
    opaque.type !== 'opaque' &&
    (
      !opaque.ok ||
      opaque.status !== 200
    )
  ) {
    throw new Error(
      'تعذر تنزيل الملف الصوتي كاملًا.',
    )
  }

  await cache.put(
    url.href,
    opaque,
  )
}

// ========================================
// Offline fallback
// ========================================

function offlineDocument() {
  return new Response(
    `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0284c7">
<title>مصحف سميع — دون اتصال</title>
<style>
*{box-sizing:border-box}
body{
  margin:0;
  min-height:100vh;
  display:grid;
  place-items:center;
  padding:20px;
  background:#f4f9fe;
  color:#123649;
  font-family:Tahoma,Arial,sans-serif;
  text-align:center
}
main{
  max-width:470px;
  width:100%;
  padding:36px 25px;
  background:#fff;
  border:1px solid #e9d9b9;
  border-radius:25px;
  box-shadow:0 15px 45px #103d4c15
}
h1{
  margin:0 0 14px;
  font-size:25px
}
p{
  color:#526579;
  line-height:2
}
a{
  display:inline-block;
  padding:13px 23px;
  margin-top:14px;
  text-decoration:none;
  background:#145b72;
  border-radius:14px;
  color:white;
  font-weight:bold
}
</style>
</head>
<body>
<main>
<h1>مصحف سميع</h1>
<p>
أنت غير متصل بالإنترنت، والصفحة المطلوبة لم تُحفظ بعد.
افتح المصحف أثناء الاتصال وحمّل الرواية التي تريدها،
ثم جرّب مجددًا.
</p>
<a href="/mushaf">فتح المصحف المحفوظ</a>
</main>
</body>
</html>`,
    {
      status: 503,
      headers: {
        'Content-Type':
          'text/html; charset=utf-8',

        'Cache-Control':
          'no-store',
      },
    },
  )
}

function samePathKey(url) {
  if (pathOf(url) === '/notifications/hadith') {
    const key = new URL('/notifications/hadith', self.location.origin)
    const id = url.searchParams.get('id')
    if (id && /^bukhari-[0-9]+$/.test(id)) key.searchParams.set('id', id)
    return key.href
  }
  return new URL(
    pathOf(url),
    self.location.origin,
  ).href
}

async function shellPage(request, url) {
  const key = samePathKey(url)

  const fallback = async () => {
    const saved = await getFromCaches(
      [NAV_CACHE, SHELL_CACHE],
      key,
    )

    return saved || offlineDocument()
  }

  try {
    const response = await fetch(request)

    if (response.ok) {
      try {
        const cache = await caches.open(NAV_CACHE)
        await storeIfSafe(cache, key, response, 'html')
      } catch { /* Online navigation remains available without storage. */ }

      return response
    }

    if (response.status >= 500) {
      return fallback()
    }

    return response
  } catch {
    return fallback()
  }
}

// ========================================
// Next.js App Router support
// ========================================

function offlineRscKey(input) {
  const url = new URL(input, self.location.origin)
  url.searchParams.delete('_rsc')
  return new URL('/__samee3_rsc?path=' + encodeURIComponent(url.pathname + url.search), self.location.origin).href
}
const QUERY_INDEPENDENT_ROUTES = new Set([
  '/', '/mushaf', '/surahs', '/index', '/adhkar', '/adhkar/read', '/adhkar/recordings', '/hadith',
  '/audio', '/audio/alafasy-riwayat', '/prayer', '/islamic-library',
  '/offline', '/offline/manage', '/offline/test', '/notifications',
])

async function publicRsc(request) {
  try {
    const response = await fetch(request)
    try {
      const cache = await caches.open(RSC_CACHE)
      await storeIfSafe(cache, request, response, 'rsc')
    } catch { /* Storage is optional. */ }

    return response
  } catch {
    let saved = await getFromCaches([RSC_CACHE], request)
    if (!saved) {
      const cache = await caches.open(RSC_CACHE), url = new URL(request.url)
      saved = await cache.match(offlineRscKey(url.href), { ignoreVary: true })
      if (!saved && QUERY_INDEPENDENT_ROUTES.has(url.pathname)) saved = await cache.match(offlineRscKey(url.pathname), { ignoreVary: true })
    }

    return (
      saved ||
      new Response(
        'Offline RSC data unavailable',
        {
          status: 503,
          headers: {
            'Content-Type':
              'text/plain; charset=utf-8',
          },
        },
      )
    )
  }
}

// ========================================
// Static assets
// ========================================

async function staticAsset(request) {
  const url = new URL(request.url)
  // Hashed Next chunks are immutable. Public icons, CSS and data can change at the same URL.
  const immutable = url.pathname.startsWith('/_next/static/')
  const cached = await getFromCaches([ASSET_CACHE, SHELL_CACHE], request)
  if (immutable && cached) return cached
  try {
    const response = await fetch(request, immutable ? undefined : { cache: 'no-cache' })
    if (response.ok) {
      try { const cache = await caches.open(ASSET_CACHE); await storeIfSafe(cache, request, response, 'asset') } catch {}
      return response
    }
    if (response.status >= 500 && cached) return cached
    return response
  } catch (error) { if (cached) return cached; throw error }
}

function isStaticAsset(url) {
  return (
    INSTALL_FILES.includes(url.pathname) ||
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:m?js|wasm|bcmap|pfb|css|woff2?|ttf|otf|png|jpe?g|webp|svg|ico|avif)$/i.test(
      url.pathname,
    )
  )
}

// ========================================
// Install application shell
// ========================================

async function prepareShell() {
  const shell = await caches.open(
    SHELL_CACHE,
  )

  const assets = new Set()

  for (const route of INSTALL_ROUTES) {
    try {
      const key = new URL(
        route,
        self.location.origin,
      ).href

      const response = await fetch(
        key,
        {
          credentials: 'omit',
          cache: 'reload',
          redirect: 'follow',
        },
      )

      const returned = new URL(
        response.url,
      )

      if (
        !response.ok ||
        pathOf(returned) !== route ||
        !(
          response.headers.get(
            'Content-Type',
          ) || ''
        ).includes('text/html') ||
        response.headers.has(
          'Set-Cookie',
        )
      ) {
        continue
      }

      await shell.put(
        key,
        response.clone(),
      )

      const html = await response.text()

      const matches =
        html.match(
          /\/_next\/static\/[^"'<>\s]+/g,
        ) || []

      matches.forEach((path) => {
        assets.add(
          path.replace(
            /&amp;/g,
            '&',
          ),
        )
      })
    } catch (error) {
      console.warn(
        'SAMEE3: app shell route not cached.',
        route,
        error,
      )
    }
  }

  for (const file of INSTALL_FILES) {
    try {
      const response = await fetch(
        file,
        {
          credentials: 'omit',
          cache: 'reload',
        },
      )

      if (response.ok) {
        await shell.put(
          file,
          response,
        )
      }
    } catch {
      // Manifest/icon are optional.
    }
  }

  const staticCache = await caches.open(
    ASSET_CACHE,
  )

  const paths = Array.from(assets).slice(
    0,
    180,
  )

  for (
    let i = 0;
    i < paths.length;
    i += 6
  ) {
    await Promise.all(
      paths.slice(i, i + 6).map(
        async (path) => {
          try {
            const response = await fetch(
              new URL(
                path,
                self.location.origin,
              ),
              {
                credentials: 'omit',
                cache: 'reload',
              },
            )

            await storeIfSafe(
              staticCache,
              path,
              response,
              'asset',
            )
          } catch {
            // Other assets can be cached later.
          }
        },
      ),
    )
  }
}

// ========================================
// Lifecycle
// ========================================

self.addEventListener(
  'install',
  (event) => {
    event.waitUntil(
      // An update waits for the existing explicit "Update" control. Otherwise
      // it could delete the old chunks while an open reader still uses them.
      prepareShell(),
    )
  },
)

self.addEventListener(
  'activate',
  (event) => {
    event.waitUntil(
      (async () => {
        const names = await caches.keys()

        const active = new Set([
          SHELL_CACHE,
          NAV_CACHE,
          ASSET_CACHE,
          RSC_CACHE,
        ])

        // Only remove caches owned by older
        // versions of this new SW implementation.
        // Never erase user-downloaded content.
        await Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith(
                  'samee3-sw-v',
                ) &&
                !active.has(name),
            )
            .map((name) =>
              caches.delete(name),
            ),
        )

        await self.clients.claim()
      })(),
    )
  },
)

// ========================================
// Fetch routing
// ========================================

async function serveSavedLibraryAudio(request, url) {
  const source = url.searchParams.get('url') || ''
  if (source) {
    let original
    try { original = new URL(source, self.location.origin) } catch { return new Response(null, { status: 400 }) }
    if (original.protocol !== 'https:' && original.origin !== self.location.origin) return new Response(null, { status: 400 })
    const names = [AUDIO_CACHE, ...OLD_AUDIO_CACHES]
    const saved = await getFromCaches(names, original.href)
    if (saved && saved.status === 200 && !saved.headers.has('Content-Range')) {
      const range = request.headers.get('Range')
      return range ? cachedAudioRange(saved, range, () => getFromCaches(names, original.href), original.href) : saved
    }
  }
  // IndexedDB Blobs are sliced on disk; large recordings never become an
  // ArrayBuffer or a page-owned object URL during offline playback.
  const key = url.searchParams.get('key') || ''
  if (!key || key.length > 1000) return new Response(null, { status: 404 })
  const blob = await new Promise(resolve => {
    let done = false, db
    const finish = value => { if (done) return; done = true; clearTimeout(timer); db?.close(); resolve(value) }
    const timer = setTimeout(() => finish(null), 8000)
    const opening = indexedDB.open('samee-audio-library')
    opening.onupgradeneeded = () => opening.transaction.abort()
    opening.onerror = opening.onblocked = () => finish(null)
    opening.onsuccess = () => {
      db = opening.result
      if (done || !db.objectStoreNames.contains('audio')) { db.close(); finish(null); return }
      try {
        const transaction = db.transaction('audio', 'readonly')
        const read = transaction.objectStore('audio').get(key)
        let result = null
        read.onsuccess = () => {
          const row = read.result
          if (row?.item?.audioUrl && source && row.item.audioUrl !== source) return
          if (row?.blob instanceof Blob && row.blob.size > 0) result = row.blob
        }
        transaction.oncomplete = () => finish(result)
        transaction.onerror = transaction.onabort = () => finish(null)
      } catch { finish(null) }
    }
  })
  if (!blob) return new Response('Audio not downloaded', { status: 404 })
  const headers = new Headers({ 'Content-Type': blob.type || 'audio/mpeg', 'Content-Length': String(blob.size), 'Accept-Ranges': 'bytes' })
  const response = new Response(blob.stream(), { headers })
  const range = request.headers.get('Range')
  return range ? cachedAudioRange(response, range) : response
}

self.addEventListener(
  'fetch',
  (event) => {
    const request = event.request

    if (
      !request ||
      request.method !== 'GET'
    ) {
      return
    }

    let url

    try {
      url = new URL(request.url)
    } catch {
      return
    }

    // SAMEE3 Adhkar: serve cached complete recordings without a page Blob.
    // This route never contacts a remote host and never clears existing caches.
    if (isSameOrigin(url) && url.pathname.startsWith('/__samee3_downloads/')) {
      event.respondWith(serveArchiveDownload(request, url))
      return
    }
    if (isSameOrigin(url) && url.pathname === '/__samee3_library_offline') {
      event.respondWith(serveSavedLibraryAudio(request, url).catch(() => new Response('Audio not downloaded', { status: 404 })))
      return
    }
    const localAdhkar = /^\/audio\/adhkar\/[a-z0-9-]+\/(?:\d{3}\/\d{3}(?:-\d{3}(?:-(?:morning|evening))?)?|sections\/\d{3})\.mp3$/.test(url.pathname)
    if (isSameOrigin(url) && (url.pathname === '/__samee3_adhkar_offline' || url.pathname === '/api/adhkar-audio' || localAdhkar)) {
      event.respondWith((async () => {
        const direct = url.pathname === '/api/adhkar-audio' || localAdhkar
        const source = direct ? url.href : url.searchParams.get('url') || ''
        let original
        try { original = new URL(source) } catch {
          return new Response('Invalid audio key', { status: 400 })
        }
        if (original.origin !== self.location.origin ||
            !(original.pathname === '/api/adhkar-audio' && original.searchParams.get('url')) &&
            !/^\/audio\/adhkar\/[a-z0-9-]+\/(?:\d{3}\/\d{3}(?:-\d{3}(?:-(?:morning|evening))?)?|sections\/\d{3})\.mp3$/.test(original.pathname)) {
          return new Response('Invalid saved audio URL', { status: 400 })
        }
        const cache = await caches.open('samee3-adhkar-audio-v1')
        const saved = await cache.match(original.href)
        if (!saved || saved.status !== 200 || saved.headers.has('Content-Range')) {
          if (direct) return fetch(request)
          return new Response('Audio not downloaded', { status: 404 })
        }
        const range = request.headers.get('Range')
        return range ? cachedAudioRange(saved, range, () => cache.match(original.href), original.href) : saved
      })().catch(() => url.pathname === '/api/adhkar-audio' || localAdhkar ? fetch(request) : new Response('Audio not downloaded', { status: 404 })))
      return
    }

    if (isSameOrigin(url) && (url.pathname.startsWith('/android/') || url.pathname === '/api/app-version' || url.pathname === '/api/app-downloads' || url.pathname === '/app-downloads.json')) return

    if (isSameOrigin(url) &&
        /^\/audio\/alafasy-riwayat\/offline\/[^/]+\/\d{3}\.mp3$/.test(url.pathname)) {
      event.respondWith(serveSavedRiwayatAudio(request))
      return
    }

    if (isQuranAudio(request, url)) {
      event.respondWith(
        serveQuranAudio(request),
      )
      return
    }

    if (!isSameOrigin(url)) {
      return
    }

    if (
      isQuranPageRequest(
        request,
        url,
      )
    ) {
      event.respondWith(
        serveQuranPage(
          request,
          url,
        ),
      )
      return
    }

    // Navigation to private pages is never
    // cached, but can show an offline fallback.
    if (request.mode === 'navigate') {
      if (isPublicPath(url)) {
        event.respondWith(
          shellPage(
            request,
            url,
          ),
        )
      } else {
        event.respondWith(
          fetch(request).catch(
            () => offlineDocument(),
          ),
        )
      }

      return
    }

    // No cache for user data or APIs.
    if (
      isPrivateRequest(
        request,
        url,
      )
    ) {
      return
    }

    if (
      isRscRequest(
        request,
        url,
      )
    ) {
      if (isPublicPath(url)) {
        event.respondWith(
          publicRsc(request),
        )
      }

      return
    }

    if (isStaticAsset(url)) {
      event.respondWith(
        staticAsset(request),
      )
    }
  },
)

// ========================================
// Commands from the application
// ========================================

self.addEventListener(
  'message',
  (event) => {
    const data = event.data

    if (
      !data ||
      typeof data.type !== 'string'
    ) {
      return
    }

    if (data.type === 'SKIP_WAITING') {
      event.waitUntil(
        self.skipWaiting(),
      )
      return
    }

    if (data.type === 'SAMEE3_PUSH_CAPABILITIES') {
      try { event.ports?.[0]?.postMessage({ type: 'SAMEE3_PUSH_CAPABILITIES', version: 1 }) } catch (_) {}
      return
    }

    if (
      data.type === 'CACHE_AUDIO_URL' &&
      typeof data.url === 'string'
    ) {
      event.waitUntil(
        (async () => {
          let success = false
          let message = ''

          try {
            await saveAudioOnRequest(
              data.url,
            )

            success = true
          } catch (error) {
            message =
              error instanceof Error
                ? error.message
                : 'تعذر حفظ الصوت.'
          }

          try {
            event.source?.postMessage({
              type:
                'CACHE_AUDIO_URL_RESULT',

              url: data.url,
              ok: success,

              error:
                message || undefined,
            })
          } catch {
            // Page may have closed.
          }
        })(),
      )

      return
    }

    if (
      data.type === 'CLEAR_SAMEE3_CACHE'
    ) {
      // Deliberately destructive command.
      // Only run when explicitly requested
      // by an application cache-clear action.
      event.waitUntil(
        caches.keys().then(
          (keys) =>
            Promise.all(
              keys
                .filter(
                  (name) =>
                    name.startsWith(
                      'samee3-',
                    ),
                )
                .map((name) =>
                  caches.delete(name),
                ),
            ),
        ),
      )
    }
  },
)

// Persistent ZIP staging is distinct from saved Quran audio. Downloads use disk chunks.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SAMEE3_DOWNLOAD_SUPPORT') {
    if (event.ports[0]) event.ports[0].postMessage({ archiveDownload: 1 })
  }
})
async function serveArchiveDownload(request, url) {
  const id = url.pathname.split('/')[2]
  if (!/^[a-z0-9-]{8,80}$/.test(id || '')) return new Response('Invalid archive', { status: 400 })
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open('samee3-downloads-v1', 1)
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
    open.onupgradeneeded = () => { open.result.createObjectStore('archives', { keyPath: 'id' }); open.result.createObjectStore('chunks', { keyPath: ['id', 'index'] }) }
  })
  const read = (store, key) => new Promise((resolve, reject) => {
    const result = db.transaction(store).objectStore(store).get(key)
    result.onsuccess = () => resolve(result.result)
    result.onerror = () => reject(result.error)
  })
  const record = await read('archives', id)
  if (!record || !record.ready) { db.close(); return new Response('لم يكتمل تجهيز الملف بعد. ارجع لسميع وأعد التحميل.', { status: 404 }) }
  let start = 0, end = record.size - 1, partial = false
  const requested = request.headers.get('range')
  if (requested) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(requested)
    if (!match || (!match[1] && !match[2])) { db.close(); return new Response(null, { status: 416 }) }
    start = match[1] ? Number(match[1]) : Math.max(0, record.size - Number(match[2]))
    end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= record.size) { db.close(); return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + record.size } }) }
    partial = true
  }
  let index = Math.floor(start / 1048576), cursor = start
  const body = new ReadableStream({
    async pull(controller) {
      try {
        if (cursor > end) { db.close(); controller.close(); return }
        const chunk = await read('chunks', [id, index])
        if (!chunk) throw new Error('Archive chunk missing')
        const from = cursor - index * 1048576
        const to = Math.min(chunk.bytes.byteLength, end - index * 1048576 + 1)
        const bytes = chunk.bytes.slice(from, to)
        index++; cursor += bytes.byteLength
        controller.enqueue(bytes)
      } catch (error) { db.close(); controller.error(error) }
    },
    cancel() { db.close() },
  })
  const headers = { 'Content-Type': 'application/zip', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="Alafasy-Mushaf.zip"; filename*=UTF-8\'\'' + encodeURIComponent(record.filename), 'X-Content-Type-Options': 'nosniff' }
  if (partial) headers['Content-Range'] = `bytes ${start}-${end}/${record.size}`
  return new Response(body, { status: partial ? 206 : 200, headers })
}

// Standards-based Web Push works with installed iPhone web apps as well as supported browsers.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) {}
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {}
  // Older browsers display declarative payloads through this legacy handler.
  const notification = data.web_push === 8030 && data.notification && typeof data.notification === 'object'
    ? data.notification : data
  const title = typeof notification.title === 'string' && notification.title ? notification.title.slice(0, 150) : 'مصحف سميع'
  // Target an actual verse, hadith or dhikr rather than opening a generic section.
  // Supports the new data.url and older payloads with nested metadata.
  const source = notification.data && typeof notification.data === 'object' ? notification.data : data
  const kind = String(source.kind || source.type || data.kind || data.type || '').toLowerCase()
  const toPositive = (value, max) => {
    const number = Number(value)
    return Number.isSafeInteger(number) && number > 0 && number <= max ? number : null
  }
  let intended = notification.navigate || source.url || data.url || '/notifications'
  if (kind === 'hadith' && typeof source.id === 'string' && /^[a-z0-9_-]{1,80}$/i.test(source.id)) {
    intended = '/notifications/hadith?id=' + encodeURIComponent(source.id)
  } else if (kind === 'hadith' && /^[a-z0-9_]{1,60}$/i.test(String(source.book || source.bookId || ''))
      && toPositive(source.chapter || source.chapterId, 100000) && toPositive(source.hadith || source.hadithId, 1000000)) {
    const params = new URLSearchParams({ book: String(source.book || source.bookId), chapter: String(source.chapter || source.chapterId), hadith: String(source.hadith || source.hadithId) })
    intended = '/hadith?' + params.toString()
  } else if ((kind === 'ayah' || kind === 'verse' || kind === 'quran') && toPositive(source.surah, 114) && toPositive(source.ayah, 286)) {
    const params = new URLSearchParams({ type: 'ayah', surah: String(source.surah), ayah: String(source.ayah) })
    if (toPositive(source.page, 604)) params.set('page', String(source.page))
    intended = '/notifications/open?' + params.toString()
  } else if ((kind === 'dhikr' || kind === 'adhkar') && toPositive(source.itemId, 10000000)) {
    const params = new URLSearchParams({ type: 'dhikr', itemId: String(source.itemId) })
    if (toPositive(source.categoryId, 1000000)) params.set('categoryId', String(source.categoryId))
    if (['morning','evening','sleep','waking'].includes(source.section)) params.set('section', source.section)
    intended = '/notifications/open?' + params.toString()
  } else if ((kind === 'quran' || kind === 'reading') && (intended === '/mushaf' || intended === '/notifications')) {
    intended = '/notifications/open?type=reading'
  }
  let target = '/notifications'
  try {
    const link = new URL(intended, self.location.origin)
    if (link.origin === self.location.origin && !link.username && !link.password && link.pathname.startsWith('/') && !link.pathname.startsWith('//') && link.href.length < 1300) target = link.pathname + link.search + link.hash
  } catch (_) {}
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof notification.body === 'string' ? notification.body.slice(0, 700) : 'حان موعد تذكيرك من سميع',
    icon: '/icon-192.png', badge: '/icon-192.png', dir: 'rtl', lang: 'ar',
    tag: typeof notification.tag === 'string' ? notification.tag.slice(0, 100) : 'samee3-reminder',
    data: { url: target },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data && event.notification.data.url || '/notifications'
  let target
  try { target = new URL(path, self.location.origin) } catch (_) { target = new URL('/notifications', self.location.origin) }
  if (target.origin !== self.location.origin || !target.pathname.startsWith('/') || target.pathname.startsWith('//')) target = new URL('/notifications', self.location.origin)
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        try { await client.navigate(target.href); return await client.focus() } catch (_) {}
      }
    }
    return self.clients.openWindow(target.href)
  })())
})
