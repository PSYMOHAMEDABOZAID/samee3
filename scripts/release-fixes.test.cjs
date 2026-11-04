const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const load = require('./load-ts.cjs')
const { StreamingMushafZip, textChunks } = load('lib/alafasy-zip-stream.ts')
const { DEFAULT_WEB_REMINDERS, parseWebSettings, reminderEvents } = load('lib/web-reminders.ts')
const { prayerInstant } = load('lib/prayer-times.ts')

test('mushaf ZIP preserves Arabic names, MP3 bytes, checksums, and the complete central directory', async () => {
  const zip = new StreamingMushafZip(), chunks = [], recordings = []
  for (let surah = 1; surah <= 114; surah++) {
    const bytes = new Uint8Array(20000 + surah).fill(surah)
    recordings.push(bytes)
    for await (const chunk of zip.add(`${String(surah).padStart(3, '0')} - سورة.mp3`, (async function* () { yield bytes.subarray(0, 100); yield bytes.subarray(100) })())) chunks.push(chunk)
  }
  for await (const chunk of zip.add('معلومات المصحف.txt', textChunks('114 سورة'))) chunks.push(chunk)
  chunks.push(...zip.finish())
  const output = await require('jszip').loadAsync(Buffer.concat(chunks), { checkCRC32: true })
  assert.equal(Object.keys(output.files).length, 115)
  assert.deepEqual(await output.file('002 - سورة.mp3').async('uint8array'), recordings[1])
  assert.equal(await output.file('معلومات المصحف.txt').async('string'), '114 سورة')
})
test('ZIP never finalizes an empty or interrupted recording as a complete file', async () => {
  const zip = new StreamingMushafZip()
  await assert.rejects(async () => { for await (const _ of zip.add('001.mp3', (async function* () {})())) {} })
  await assert.rejects(async () => { for await (const _ of zip.add('002.mp3', (async function* () { yield new Uint8Array([1]); throw Error('disconnected') })())) {} }, /disconnected/)
})
test('ZIP audio range retries do not duplicate an interrupted segment', async () => {
  let calls = 0
  const { recordingChunks } = load('lib/riwayat-download.ts', { Uint8Array, AbortSignal, fetch: async () => {
    calls++
    return new Response(new Uint8Array(calls === 1 ? [1, 2] : [1, 2, 3, 4]), { status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 0-3/4' } })
  } })
  const bytes = []
  for await (const chunk of recordingChunks('/audio', new AbortController().signal, () => {})) bytes.push(...chunk)
  assert.equal(calls, 2); assert.deepEqual(bytes, [1, 2, 3, 4])
})
test('a server returning a different byte range is rejected instead of corrupting ZIP', async () => {
  const { recordingChunks } = load('lib/riwayat-download.ts', { Uint8Array, AbortSignal, fetch: async () => new Response(new Uint8Array([1, 2]), { status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': 'bytes 4-5/8' } }) })
  await assert.rejects(async () => { for await (const _ of recordingChunks('/audio', new AbortController().signal, () => {})) {} }, /غير صالح/)
})
test('the public library contains exactly one book in every level/category without deleting admin records', () => {
  const { mergeLibraryCatalog, publicLibraryBooks } = load('lib/islamic/managed-library.ts')
  const catalog = mergeLibraryCatalog([]), visible = publicLibraryBooks(catalog)
  assert.equal(visible.length, 24)
  assert.equal(new Set(visible.map(book => `${book.levelId}/${book.category}`)).size, 24)
  assert.ok(catalog.length > visible.length)
  const withChoice = mergeLibraryCatalog([{ id: 'extra-book', data: { title: 'كتاب الإدارة', author: 'مؤلف', category: 'aqidah', level: 'مبتدئ', featuredAt: 123 } }])
  assert.equal(publicLibraryBooks(withChoice).find(book => book.category === 'aqidah' && book.levelId === 'beginner').id, 'extra-book')
  assert.equal(publicLibraryBooks(mergeLibraryCatalog([{ id: 'extra-book', data: { title: 'محذوف', featuredAt: 99999, deleted: true } }])).some(book => book.id === 'extra-book'), false)
})
test('notification settings reject malformed clocks, zones, prayer locations and unsupported methods', () => {
  const defaults = { ...DEFAULT_WEB_REMINDERS }
  assert.equal(parseWebSettings(defaults).timezone, 'Asia/Muscat')
  for (const change of [{ quranTime: '25:00' }, { timezone: 'Invalid/Zone' }, { timezone: '' }, { method: 999 }, { prayer: true }, { latitude: 91 }, { hadithStart: 23, hadithEnd: 8 }]) assert.throws(() => parseWebSettings({ ...defaults, ...change }))
})
test('reminder scheduling uses local dates, skips sunrise, includes tomorrow Fajr and Friday library', () => {
  const settings = parseWebSettings({ ...DEFAULT_WEB_REMINDERS, prayer: true, library: true, latitude: 23.588, longitude: 58.3829 })
  const timings = { Fajr: '05:00', Sunrise: '06:20', Dhuhr: '12:00', Asr: '15:00', Maghrib: '18:00', Isha: '19:30' }
  const days = ['2026-11-05', '2026-11-06', '2026-11-07'].map(date => ({ date, timezone: settings.timezone, timings }))
  const after = prayerInstant('2026-11-05', '23:59', settings.timezone)
  const events = reminderEvents(settings, after, days)
  assert.equal(events.find(event => event.kind === 'Fajr').at, prayerInstant('2026-11-06', '05:00', settings.timezone))
  assert.equal(events.some(event => event.kind === 'Sunrise'), false)
  assert.equal(events.filter(event => event.kind === 'library').length, 1)
  assert.ok(events.every(event => event.at > after))
})
test('web push subscription endpoints reject arbitrary hosts, credentials and misleading subdomains', () => {
  const { validSubscription } = load('lib/server/web-push.ts')
  const keys = { auth: Buffer.alloc(16).toString('base64url'), p256dh: Buffer.alloc(65).toString('base64url') }
  for (const endpoint of ['http://fcm.googleapis.com/a', 'https://127.0.0.1/a', 'https://fcm.googleapis.com.evil.test/a', 'https://user:pass@fcm.googleapis.com/a', 'https://fcm.googleapis.com:444/a']) assert.throws(() => validSubscription({ endpoint, keys }))
  assert.equal(validSubscription({ endpoint: 'https://web.push.apple.com/example', keys }).endpoint, 'https://web.push.apple.com/example')
})
test('push events always produce a visible notification and cannot navigate to another origin', async () => {
  const handlers = {}, shown = []
  const context = { URL, Request, Response, Headers, ReadableStream, Map, Uint8Array, console, setTimeout, clearTimeout, self: { location: { origin: 'https://samee3.test' }, addEventListener: (name, fn) => { handlers[name] = fn }, registration: { showNotification: async (...args) => shown.push(args) } } }
  vm.createContext(context); vm.runInContext(fs.readFileSync('public/sw.js', 'utf8'), context)
  let wait
  handlers.push({ data: { json: () => ({ title: 'الفجر', url: 'https://evil.test/', body: 'تذكير' }) }, waitUntil: p => { wait = p } }); await wait
  assert.equal(shown.length, 1); assert.equal(shown[0][1].data.url, '/notifications')
  handlers.push({ data: { json: () => { throw Error('bad JSON') } }, waitUntil: p => { wait = p } }); await wait
  assert.equal(shown.length, 2)
})
test('native ZIP export uses acknowledged small chunks and an exact final byte count', async () => {
  const java = fs.readFileSync('native/android/app/src/main/java/app/samee3/quran/WebActivity.java', 'utf8')
  const expression = java.slice(java.indexOf('        String script='), java.indexOf('        web.evaluateJavascript', java.indexOf('        String script=')))
  const literals = [...expression.matchAll(/"(?:\\.|[^"\\])*"/g)].map(match => JSON.parse(match[0]))
  const code = literals.slice(0, -1).join('') + JSON.stringify('test-export-token') + literals.at(-1)
  const handlers = {}, messages = []
  const window = { addEventListener: (name, fn) => { handlers[name] = fn }, removeEventListener() {} }
  const port = { start() {}, close() {}, postMessage(value) { messages.push(JSON.parse(value)); queueMicrotask(() => port.onmessage({ data: '{"ok":true}' })) } }
  vm.runInNewContext(code, { window, document: { addEventListener() {}, removeEventListener() {} }, setTimeout, clearTimeout, btoa, FileReader: function () {} })
  handlers.message({ data: 'test-export-token', ports: [port] })
  const writer = await window.Samee3FileWriter.create('المصحف.zip')
  await writer.write(new Uint8Array(600000).fill(7)); await writer.close()
  assert.equal(messages[0].size, 0)
  const chunks = messages.filter(message => message.type === 'chunk')
  assert.ok(chunks.length > 1)
  assert.ok(chunks.every((message, i) => message.seq === i && Buffer.from(message.data, 'base64').length <= 196608))
  assert.equal(chunks.reduce((sum, message) => sum + Buffer.from(message.data, 'base64').length, 0), 600000)
  assert.equal(messages.at(-1).size, 600000)
})
test('cancellation helpers work without the newer Safari AbortSignal static APIs', () => {
  const abort = load('lib/abort-signals.ts', { AbortSignal: {}, AbortController, DOMException, setTimeout: callback => { callback(); return 1 } })
  assert.equal(abort.timeoutSignal(10).aborted, true)
  const first = new AbortController(), second = new AbortController()
  const combined = abort.combineSignals([first.signal, second.signal])
  second.abort(); assert.equal(combined.aborted, true); assert.throws(() => abort.throwIfAborted(combined))
})
