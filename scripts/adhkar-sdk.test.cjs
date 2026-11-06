const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const load = require('./load-ts.cjs')
const sdk = import('data:text/javascript;base64,' + fs.readFileSync('public/adhkar-sdk/v1/index.js').toString('base64'))

test('the simple API returns usable absolute audio URLs and per-file timings for exactly the chosen reader', async () => {
  const { GET } = load('app/api/adhkar/v1/items/route.ts')
  const response = GET(new Request('https://samee3.test/api/adhkar/v1/items?format=simple&reciter=mishary-alafasy&category=1&section=morning&limit=100'))
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*')
  const data = await response.json()
  assert.ok(data.items.length > 0)
  assert.equal(data.access.apiKeyRequired, false)
  for (const item of data.items) {
    assert.match(item.audioUrl, /^https:\/\/samee3.vercel.app\/audio\/adhkar\/mishary-alafasy\//)
    assert.equal(item.startMs, 0); assert.equal(item.endMs, item.durationMs)
    assert.ok(item.text && item.rightsId)
  }
})

test('absolute audio links use the public site origin rather than a proxy or internal Next.js hostname', () => {
  const { adhkarPublicOrigin, simpleAdhkarAudio } = load('lib/adhkar-developer-api.ts')
  assert.equal(adhkarPublicOrigin(), 'https://samee3.vercel.app')
  for (const value of ['javascript:bad', 'https://user:pass@evil.test', 'http://insecure.example']) assert.equal(adhkarPublicOrigin(value), 'https://samee3.vercel.app')
  const origin = adhkarPublicOrigin('https://my-library.example/app')
  assert.equal(origin, 'https://my-library.example')
  const result = simpleAdhkarAudio(new URLSearchParams({ reciter: 'hamad-al-drehem', limit: '1' }), origin)
  assert.ok(result.items[0].audioUrl.startsWith('https://my-library.example/audio/'))
})

test('simple format validates its reader and does not fabricate audio for missing recordings', async () => {
  const { GET } = load('app/api/adhkar/v1/items/route.ts')
  for (const suffix of ['format=simple', 'format=simple&reciter=not-a-reader', 'format=unknown']) {
    const result = GET(new Request('https://samee3.test/api/adhkar/v1/items?' + suffix)); assert.equal(result.status, 400)
  }
  const response = GET(new Request('https://samee3.test/api/adhkar/v1/items?format=simple&reciter=mishary-alafasy&includeMissing=1&limit=100'))
  const missing = (await response.json()).items.find(item => item.audioUrl === null)
  assert.ok(missing); assert.equal(missing.startMs, null); assert.equal(missing.endMs, null)
})

test('complete-recording timings are derived only from matching reader, original source URL and source hash', () => {
  const { adhkarSectionTimings, adhkarAudioCatalog: catalog } = load('lib/adhkar-developer-api.ts')
  let matching = 0, empty = 0
  for (const recording of catalog.sectionRecordings) {
    const result = adhkarSectionTimings(recording.id)
    result.items.length ? matching++ : empty++
    for (const row of result.items) {
      assert.ok(row.startMs >= 0 && row.endMs > row.startMs && row.endMs <= recording.durationMs)
      const item = catalog.items.find(item => item.id === row.id)
      const candidates = [item.recordings[recording.readerId], ...Object.values(item.variants?.[recording.readerId] || {})]
      assert.ok(candidates.some(clip => clip && clip.source.url === recording.source.url && clip.source.sha256 === recording.source.sha256 && clip.source.startMs - recording.source.startMs === row.startMs))
    }
    assert.equal(result.total, result.items.length)
    if (!result.items.length) assert.equal(result.coverage, 'no-published-segments')
  }
  assert.ok(matching > 0 && empty > 0)
  assert.equal(adhkarSectionTimings('../x'), null)
})

test('recording timing HTTP requests are public, support CORS and reject unknown ids', async () => {
  const { GET, OPTIONS } = load('app/api/adhkar/v1/sections/[recording]/timings/route.ts')
  const ok = await GET(new Request('https://samee3.test'), { params: Promise.resolve({ recording: 'mishary-alafasy:104' }) })
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('Access-Control-Allow-Origin'), '*')
  assert.ok((await ok.json()).items.length)
  const missing = await GET(new Request('https://samee3.test'), { params: Promise.resolve({ recording: '../x' }) })
  assert.equal(missing.status, 404); assert.equal(missing.headers.get('Cache-Control'), 'no-store')
  assert.equal(OPTIONS().status, 204)
})

test('SDK fetches and paginates real API responses without an account, authorization headers or lost dhikr', async () => {
  const { Samee3Adhkar } = await sdk
  const { GET } = load('app/api/adhkar/v1/items/route.ts'), calls = []
  const api = new Samee3Adhkar({ baseUrl: 'https://samee3.test', fetch: async (url, options) => { calls.push({ url, options }); return GET(new Request(url)) } })
  const items = []
  for await (const item of api.allItems({ reciter: 'hamad-al-drehem' })) items.push(item)
  assert.equal(items.length, 267); assert.equal(new Set(items.map(item => item.id)).size, 267)
  assert.equal(calls.length, 3)
  assert.ok(calls.every(call => !call.options.headers && new URL(call.url).searchParams.get('format') === 'simple'))
})

test('SDK cancellation, useful HTTP errors and recording URL resolution work outside the SAMEE3 origin', async () => {
  const { Samee3Adhkar } = await sdk
  const controller = new AbortController(); let passedSignal
  const api = new Samee3Adhkar({ baseUrl: 'https://samee3.test', fetch: async (url, options) => {
    passedSignal = options.signal
    return Response.json(url.includes('/timings') ? { recording: { url: '/audio/a.mp3' }, items: [] } : { recordings: [{ url: '/audio/a.mp3' }] })
  } })
  assert.equal((await api.recordings({}, { signal: controller.signal })).recordings[0].url, 'https://samee3.test/audio/a.mp3')
  assert.equal(passedSignal, controller.signal)
  assert.equal((await api.recordingTimings('reader:1')).recording.url, 'https://samee3.test/audio/a.mp3')
  const failing = new Samee3Adhkar({ fetch: async () => Response.json({ error: 'Unknown reciter' }, { status: 400 }) })
  await assert.rejects(failing.items({ reciter: 'bad' }), error => error.status === 400 && error.message === 'Unknown reciter')
  assert.throws(() => failing.items({}), /reciter/)
})

test('copied SDK code defaults to the SAMEE3 service and resolves every timing-file audio URL', async () => {
  const { Samee3Adhkar } = await sdk
  let requested
  const api = new Samee3Adhkar({ fetch: async url => {
    requested = url
    return Response.json({ items: [{ url: '/audio/one.mp3' }], variants: [{ url: '/audio/two.mp3' }], sections: [{ url: '/audio/complete.mp3' }] })
  } })
  const data = await api.timings('mishary-alafasy')
  assert.equal(new URL(requested).origin, 'https://samee3.vercel.app')
  for (const recording of [...data.items, ...data.variants, ...data.sections]) assert.match(recording.url, /^https:\/\/samee3.vercel.app\/audio\//)
})

test('SDK preserves cancellation during body parsing and rejects broken pagination instead of looping', async () => {
  const { Samee3Adhkar } = await sdk
  const abort = new DOMException('Cancelled', 'AbortError')
  const cancelled = new Samee3Adhkar({ fetch: async () => ({ json: async () => { throw abort } }) })
  await assert.rejects(cancelled.items({ reciter: 'hamad-al-drehem' }), error => error === abort)
  const broken = new Samee3Adhkar({ fetch: async () => Response.json({ items: [], nextOffset: 0 }) })
  await assert.rejects(async () => { for await (const _ of broken.allItems({ reciter: 'hamad-al-drehem' })) {} }, /pagination/)
})

test('recording filters search Arabic reader names and titles together; queues retain full-recording identities', () => {
  const { filterCompleteAdhkar, recordingPlaybackTracks } = load('lib/adhkar-recordings.ts')
  const { localAdhkarSections } = load('lib/adhkar-local-audio.ts')
  const names = { 'mishary-alafasy': 'مشاري العفاسي' }
  const result = filterCompleteAdhkar(localAdhkarSections(), names, '', 'morning', 'العفاسي الصباح')
  assert.ok(result.length > 0)
  assert.ok(result.every(row => row.readerId === 'mishary-alafasy' && row.type === 'morning'))
  const queue = recordingPlaybackTracks(result, names)
  assert.equal(queue[0].adhkar.recordingId, result[0].id)
  assert.equal(queue[0].subtitle, 'مشاري العفاسي')
  assert.equal(filterCompleteAdhkar(localAdhkarSections(), names, 'unknown', 'all', '').length, 0)
})
