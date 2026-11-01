
#!/usr/bin/env node

/**
 * SAMEE3 audio stability migration.
 * Applies guarded updates to the existing audio library.
 * Preserves the current player, reciters, sections and saved audio.
 */

const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pagePath = path.join(root, 'app/audio/page.tsx')
const workerPath = path.join(root, 'public/sw.js')

function replaceBetween(input, first, last, updated, label) {
  const from = input.indexOf(first)

  if (
    from < 0 ||
    input.indexOf(first, from + first.length) !== -1
  ) {
    throw new Error(
      `${label}: start anchor missing or ambiguous; no files written.`
    )
  }

  const to = input.indexOf(last, from + first.length)

  if (to < 0) {
    throw new Error(
      `${label}: end anchor missing; no files written.`
    )
  }

  return input.slice(0, from) + updated + '\n' + input.slice(to)
}

function replaceOnce(input, from, to, label) {
  const i = input.indexOf(from)

  if (
    i < 0 ||
    input.indexOf(from, i + from.length) !== -1
  ) {
    throw new Error(
      `${label}: matching code not found exactly once; no files written.`
    )
  }

  return input.slice(0, i) + to + input.slice(i + from.length)
}

if (!fs.existsSync(pagePath) || !fs.existsSync(workerPath)) {
  throw new Error(
    'Required files app/audio/page.tsx and public/sw.js were not found.'
  )
}

let page = fs.readFileSync(pagePath, 'utf8')
let sw = fs.readFileSync(workerPath, 'utf8')

const MARKER = 'SAMEE3_AUDIO_STABILITY_2026_11'

if (page.includes(MARKER) && sw.includes(MARKER)) {
  console.log('Audio stability fix already installed.')
  process.exit(0)
}

// 1. Enumerate offline keys without deserializing every MP3.

const listOfflineReplacement = `// SAMEE3_AUDIO_STABILITY_2026_11: key-only enumeration avoids loading every saved MP3.
async function listOffline(): Promise<OfflineRecord[]> {
  const db = await getOfflineDb()
  const index = new Map(readAudioCatalog().map(item => [offlineKeyFor(item), item]))
  return new Promise((resolve, reject) => {
    const rows: OfflineRecord[] = []
    try {
      const tx = db.transaction('audio', 'readonly')
      const request = tx.objectStore('audio').openKeyCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        const key = String(cursor.primaryKey)
        const item = index.get(key)
        rows.push({
          key,
          title: item?.title || 'تسجيل محفوظ',
          subtitle: item?.subtitle || '',
          savedAt: 0,
          item,
          blob: new Blob(),
        })
        cursor.continue()
      }
      tx.oncomplete = () => { db.close(); resolve(rows) }
      tx.onabort = tx.onerror = () => {
        db.close()
        reject(tx.error || new Error('تعذر فهرسة الصوت المحفوظ.'))
      }
    } catch (error) {
      db.close()
      reject(error)
    }
  })
}
`

page = replaceBetween(
  page,
  'async function listOffline(): Promise<OfflineRecord[]> {',
  'function offlineKeyFor(item: PlayerItem)',
  listOfflineReplacement,
  'Lightweight IndexedDB index'
)

// 2. Avoid loading large cached recordings into Blob memory.

page = replaceOnce(
  page,
  '        const savedBlob = await getSavedBlob(currentPlayer)',
  `        // SAMEE3_AUDIO_STABILITY_2026_11: stream CacheStorage recordings
        // via SW; use Blob URLs only for recordings held in IndexedDB.
        const cacheStreamSupported = Boolean(
          currentPlayer.kind === 'quran' &&
          navigator.serviceWorker?.controller &&
          /^https:\\/\\/(?:[a-z0-9-]+\\.)*mp3quran\\.net\\//i.test(currentPlayer.audioUrl)
        )
        const cacheResponse = cacheStreamSupported
          ? await findCachedAudio(currentPlayer.audioUrl)
          : null
        const cachedStream = Boolean(cacheResponse)
        if (cacheResponse) {
          void cacheResponse.body?.cancel().catch(() => undefined)
        }
        const savedBlob = cachedStream ? null : await getSavedBlob(currentPlayer)`,
  'CacheStorage playback'
)

page = replaceOnce(
  page,
  '        } else if (!source || navigator.onLine === false) {',
  '        } else if (!source || (navigator.onLine === false && !cachedStream)) {',
  'Offline cached stream guard'
)

// 3. Load ZIP library only when exporting recordings.

page = replaceOnce(
  page,
  "import JSZip from 'jszip'\n",
  '',
  'Lazy ZIP loading import'
)

page = replaceOnce(
  page,
  '      const zip = new JSZip()',
  "      const { default: JSZip } = await import('jszip')\n      const zip = new JSZip()",
  'Lazy ZIP loading usage'
)

// 4. Stream HTTP byte ranges from cached audio.

const swReplacement = `// SAMEE3_AUDIO_STABILITY_2026_11: stream ranges without full-file Blob allocation.
function cachedAudioRange(response, rangeHeader) {
  const lengthHeader = response.headers.get('Content-Length')
  const total = lengthHeader && /^\\d+$/.test(lengthHeader) ? Number(lengthHeader) : 0
  const match = /^bytes=(\\d*)-(\\d*)$/i.exec(rangeHeader.trim())
  if (!total || !Number.isSafeInteger(total) || !match || (!match[1] && !match[2]) || !response.body) {
    return response
  }
  let start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]))
  let end = match[2] && match[1] ? Number(match[2]) : total - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= total || end < start) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + total } })
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
          if (next.done) { finished = true; controller.close(); return }
          const bytes = next.value
          const from = position
          const to = from + bytes.byteLength
          position = to
          if (to <= start) continue
          const low = Math.max(0, start - from)
          const high = Math.min(bytes.byteLength, end - from + 1)
          if (high > low) controller.enqueue(bytes.subarray(low, high))
          if (to > end) {
            finished = true
            controller.close()
            void reader.cancel().catch(() => undefined)
          }
          return
        }
      } catch (error) {
        finished = true
        controller.error(error)
      }
    },
    cancel(reason) { finished = true; return reader.cancel(reason) },
  })
  return new Response(stream, {
    status: 206,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
      'Content-Length': String(end - start + 1),
    },
  })
}

async function serveQuranAudio(request) {
  const cached = await getFromCaches([AUDIO_CACHE, ...OLD_AUDIO_CACHES], request.url)
  if (cached) {
    const range = request.headers.get('Range')
    if (range && cached.type !== 'opaque') return cachedAudioRange(cached, range)
    return cached
  }
  // Never automatically cache an audio file unless the user explicitly saves it.
  return fetch(request)
}
`

sw = replaceBetween(
  sw,
  'async function serveQuranAudio(request) {',
  'async function saveAudioOnRequest(urlString) {',
  swReplacement,
  'Service worker streaming ranges'
)

sw = replaceOnce(
  sw,
  "const SW_VERSION = 'samee3-sw-v9'",
  "const SW_VERSION = 'samee3-sw-v10'",
  'Service worker version'
)

// Commit changes only after all guards have passed.

fs.writeFileSync(pagePath, page, 'utf8')
fs.writeFileSync(workerPath, sw, 'utf8')

console.log('SAMEE3 audio stability patch applied.')
console.log('Updated:', pagePath)
console.log('Updated:', workerPath)
console.log('Existing catalog, saved audio and UI preserved.')
