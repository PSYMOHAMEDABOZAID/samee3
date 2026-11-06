const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createECDH } = require('node:crypto')
const load = require('./load-ts.cjs')
const { createPersistentPlayer } = load('lib/persistent-player.ts')

class AudioStub extends EventTarget {
  constructor() { super(); this.attributes = new Map(); this.paused = true; this.ended = false; this.currentTime = 0; this.duration = 120; this.playCalls = 0; this.pauseCalls = 0; this.error = null }
  set src(value) { this.attributes.set('src', value); this.currentTime = 0; this.ended = false; this.error = null }
  get src() { return this.attributes.get('src') || '' }
  getAttribute(key) { return this.attributes.get(key) || null }
  removeAttribute(key) { this.attributes.delete(key) }
  load() {}
  play() { this.playCalls++; this.paused = false; this.ended = false; this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing')); return Promise.resolve() }
  pause() { this.pauseCalls++; if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')) } }
  end() { this.paused = true; this.ended = true; this.dispatchEvent(new Event('ended')) }
}
function setup(extra = {}) {
  const audio = new AudioStub(), saved = []
  const player = createPersistentPlayer({ createAudio: () => audio, resolve: track => ({ src: track.url }), saveCounts: (key, counts) => saved.push({ key, counts }), day: () => '2026-11-05', ...extra })
  return { audio, player, saved }
}
const track = (url, extra = {}) => ({ url, title: url, subtitle: 'القارئ', ...extra })
const start = (player, queue, extra = {}) => player.start({ scope: 'library', href: '/audio', queue, index: 0, ...extra })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('play starts during the click; detaching a route view leaves audio and the queue running', () => {
  const { player, audio } = setup(); let updates = 0
  const detach = player.subscribe(() => updates++)
  start(player, [track('first'), track('second')])
  assert.equal(audio.playCalls, 1)
  assert.equal(player.getSnapshot().playing, true)
  detach(); const before = updates
  audio.end()
  assert.equal(audio.src, 'second'); assert.equal(audio.playCalls, 2)
  assert.equal(updates, before); assert.equal(player.getSnapshot().index, 1)
  const restore = player.subscribe(() => updates++)
  assert.equal(player.getSnapshot().queue[1].url, 'second')
  restore()
})
test('one application media element switches sections, preserving rate and volume', () => {
  let created = 0
  const { player, audio } = setup({ createAudio: () => { created++; return audio } })
  start(player, [track('quran')]); player.settings({ rate: 1.25, volume: 0.6, muted: true })
  start(player, [track('dhikr')], { scope: 'adhkar', contextKey: 'morning' })
  assert.equal(created, 1); assert.equal(audio.src, 'dhikr')
  assert.equal(audio.playbackRate, 1.25); assert.equal(audio.volume, 0.6); assert.equal(audio.muted, true)
  player.stop('library'); assert.equal(audio.src, 'dhikr')
  player.stop('adhkar'); assert.equal(audio.src, ''); assert.equal(player.getSnapshot().scope, null)
})
test('a late offline lookup cannot replace a newer recording and releases its temporary URL', async () => {
  let resolveOld, released = 0
  const { player, audio } = setup({ resolve: item => item.url === 'old' ? new Promise(resolve => { resolveOld = resolve }) : { src: item.url } })
  start(player, [track('old')]); start(player, [track('new')])
  resolveOld({ src: 'blob:old', release: () => released++ }); await tick()
  assert.equal(audio.src, 'new'); assert.equal(released, 1)
})
test('cancelling a loading recording prevents its late promise from starting audio', async () => {
  let resolveTrack
  const { player, audio } = setup({ resolve: () => new Promise(resolve => { resolveTrack = resolve }) })
  start(player, [track('offline')]); player.toggle()
  resolveTrack({ src: 'offline' }); await tick()
  assert.equal(audio.playCalls, 0); assert.equal(player.getSnapshot().loading, false)
})
test('adhkar repetitions, sequence and saved counts continue after the page detaches', () => {
  const { player, audio, saved } = setup()
  start(player, [track('one', { itemId: 1, repetitions: 2 }), track('two', { itemId: 2, repetitions: 1 })], { scope: 'adhkar', contextKey: 'morning', counts: { 1: 2, 2: 1 } })
  audio.end(); assert.equal(audio.src, 'one'); assert.equal(player.getSnapshot().counts[1], 1)
  audio.end(); assert.equal(audio.src, 'two'); assert.equal(player.getSnapshot().counts[1], 0)
  audio.end(); assert.equal(player.getSnapshot().playing, false); assert.equal(player.getSnapshot().counts[2], 0)
  assert.equal(saved.length, 3); assert.equal(saved[2].key, 'morning')
})
test('a later dhikr completed by tapping is skipped by the running sequence', () => {
  const { player, audio } = setup()
  start(player, [track('one', { itemId: 1 }), track('two', { itemId: 2 }), track('three', { itemId: 3 })], { scope: 'adhkar', contextKey: 'morning', counts: { 1: 1, 2: 1, 3: 1 } })
  player.setCounts('morning', { 1: 1, 2: 0, 3: 1 }); audio.end()
  assert.equal(audio.src, 'three')
})
test('single-item listening counts once without forcing all remaining repetitions', () => {
  const { player, audio } = setup()
  start(player, [track('one', { itemId: 1, repetitions: 3, repeatRemaining: false })], { scope: 'adhkar', counts: { 1: 3 } })
  audio.end(); assert.equal(audio.playCalls, 1); assert.equal(player.getSnapshot().counts[1], 2)
})

test('a chosen listening count repeats exactly without changing the prescribed dhikr count', () => {
  const {player,audio,saved}=setup()
  start(player,[track('one',{itemId:1,repetitions:1,listenRepeats:3})],{scope:'adhkar',contextKey:'morning',counts:{1:1}})
  audio.end();audio.end();audio.end()
  assert.equal(audio.playCalls,3);assert.equal(player.getSnapshot().playing,false)
  assert.equal(player.getSnapshot().counts[1],0);assert.equal(saved.length,1)
  assert.equal(player.getSnapshot().playCount,3);assert.equal(player.getSnapshot().playTarget,3)
})
test('completed dhikr can be replayed deliberately with a finite listening count', () => {
  const {player,audio,saved}=setup()
  start(player,[track('completed',{itemId:1,listenRepeats:2})],{scope:'adhkar',counts:{1:0}})
  audio.end();audio.end()
  assert.equal(audio.playCalls,2);assert.equal(player.getSnapshot().counts[1],0)
  assert.equal(saved.length,0);assert.equal(player.getSnapshot().playing,false)
})
test('each queued dhikr gets its own listening budget and pausing does not reset it',()=>{
  const {player,audio}=setup()
  start(player,[track('a',{itemId:1,listenRepeats:2}),track('b',{itemId:2,listenRepeats:2})],{scope:'adhkar',counts:{1:3,2:1},repeat:'off'})
  audio.end();player.toggle();assert.equal(audio.paused,true);player.toggle()
  assert.equal(player.getSnapshot().playCount,1)
  audio.end();assert.equal(audio.src,'b');assert.equal(player.getSnapshot().playCount,0)
  audio.end();audio.end();assert.equal(player.getSnapshot().playing,false)
  assert.deepEqual(player.getSnapshot().counts,{1:1,2:0})
})
test('a new finite session clears an earlier infinite loop choice atomically',()=>{
  const {player,audio}=setup()
  start(player,[track('loop')]);player.settings({repeat:'one'})
  start(player,[track('once',{itemId:1,listenRepeats:1})],{scope:'adhkar',counts:{1:3},repeat:'off'})
  audio.end();assert.equal(player.getSnapshot().playing,false)
  assert.equal(player.getSnapshot().counts[1],2)
})
test('resuming a finished custom session starts a fresh finite budget', () => {
  const { player, audio } = setup()
  start(player, [track('dhikr', { itemId: 1, listenRepeats: 2 })], { scope: 'adhkar', counts: { 1: 1 }, repeat: 'off' })
  audio.end(); audio.end(); assert.equal(player.getSnapshot().playCount, 2)
  player.toggle(); assert.equal(player.getSnapshot().playCount, 0)
  audio.end(); audio.end()
  assert.equal(audio.playCalls, 4); assert.equal(player.getSnapshot().playing, false); assert.equal(player.getSnapshot().counts[1], 0)
})
test('repeating a complete source never changes individual dhikr counters', () => {
  const { player, audio, saved } = setup()
  start(player, [track('full-source', { listenRepeats: 2 })], { scope: 'adhkar', counts: { 1: 3 }, repeat: 'off' })
  audio.end(); audio.end()
  assert.equal(audio.playCalls, 2); assert.equal(player.getSnapshot().playing, false)
  assert.deepEqual(player.getSnapshot().counts, { 1: 3 }); assert.equal(saved.length, 0)
})
test('repeat-all and repeat-one survive track changes without a page callback', () => {
  const { player, audio } = setup(); start(player, [track('a'), track('b')])
  player.settings({ repeat: 'all' }); audio.end(); audio.end(); assert.equal(audio.src, 'a')
  player.settings({ repeat: 'one' }); audio.end(); assert.equal(audio.src, 'a')
  start(player, [track('c')]); assert.equal(player.getSnapshot().repeat, 'one')
})
test('daily adhkar never write yesterday’s completion into a new day', () => {
  let day = '2026-11-05'
  const { player, audio, saved } = setup({ day: () => day })
  start(player, [track('one', { itemId: 1, repetitions: 2 })], { scope: 'adhkar', contextKey: 'morning', daily: true })
  day = '2026-11-06'; audio.end()
  assert.equal(saved.length, 0); assert.equal(player.getSnapshot().playing, false)
})
test('resume seeks only the selected recording after metadata arrives', () => {
  const { player, audio } = setup({ resolve: item => ({ src: item.url, position: 35 }) })
  start(player, [track('resume')]); audio.dispatchEvent(new Event('loadedmetadata'))
  assert.equal(audio.currentTime, 35)
})

function keyPair() { const key = createECDH('prime256v1'); key.generateKeys(); return { public: key.getPublicKey().toString('base64url'), private: key.getPrivateKey().toString('base64url') } }
test('push configuration rejects code pasted as a key, invalid private keys and mismatched pairs', () => {
  const { validatePushConfiguration } = load('lib/server/push-config.ts')
  const keys = keyPair(), other = keyPair()
  const env = { NEXT_PUBLIC_WEB_PUSH_VAPID_KEY: keys.public, WEB_PUSH_VAPID_PRIVATE_KEY: keys.private, WEB_PUSH_SUBJECT: 'mailto:admin@example.com', CRON_SECRET: 'a-test-secret' }
  assert.equal(validatePushConfiguration(env).ok, true)
  assert.equal(validatePushConfiguration({ ...env, NEXT_PUBLIC_WEB_PUSH_VAPID_KEY: '"+Buffer.concat([Buffer.from([4])])' }).code, 'INVALID_VAPID_PUBLIC_KEY')
  assert.equal(validatePushConfiguration({ ...env, WEB_PUSH_VAPID_PRIVATE_KEY: 'invalid' }).code, 'INVALID_VAPID_PRIVATE_KEY')
  assert.equal(validatePushConfiguration({ ...env, WEB_PUSH_VAPID_PRIVATE_KEY: other.private }).code, 'VAPID_KEY_PAIR_MISMATCH')
})
test('the standalone generator emits one valid pair without changing the scheduler secret', () => {
  const output = require('node:child_process').execFileSync(process.execPath, ['scripts/generate-push-keys.cjs', '--vapid-only'], { encoding: 'utf8' })
  const env = Object.fromEntries(output.trim().split('\n').map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)] }))
  env.WEB_PUSH_SUBJECT = 'mailto:admin@example.com'; env.CRON_SECRET = 'existing-secret'
  assert.equal(load('lib/server/push-config.ts').validatePushConfiguration(env).ok, true)
  assert.equal(output.includes('CRON_SECRET'), false)
})

function memoryCaches() {
  const stores = new Map()
  const absolute = value => new URL(typeof value === 'string' ? value : value.url, 'https://samee3.test').href
  return {
    async keys() { return [...stores.keys()] },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map())
      const rows = stores.get(name)
      return { async match(key) { return rows.get(absolute(key))?.clone() }, async put(key, response) {
        const bytes = await response.arrayBuffer(); rows.set(absolute(key), new Response(bytes, { status: response.status, headers: response.headers }))
      } }
    },
    async match(key) { for (const name of stores.keys()) { const row = await (await this.open(name)).match(key); if (row) return row } },
  }
}
const input = '/api/adhkar-audio?url=' + encodeURIComponent('https://download.tvquran.com/download/TvQuran.com__Athkar/TvQuran.com_athkar_03.mp3')
function downloader(fetch, caches = memoryCaches()) {
  return { caches, ...load('lib/adhkar-offline.ts', { Uint8Array, ReadableStream, TransformStream, AbortController, location: { origin: 'https://samee3.test' }, window: { caches }, caches, fetch }) }
}
test('an interrupted middle part is retried without redownloading the beginning or caching a partial MP3', async () => {
  const bytes = new Uint8Array(512 * 1024 * 2 + 13).fill(17), calls = [], failed = new Set()
  const api = downloader(async (_url, options) => {
    const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range)
    const first = Number(a), last = Math.min(Number(b), bytes.length - 1)
    calls.push(first)
    if (first === 512 * 1024 && !failed.has(first)) {
      failed.add(first)
      return new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(first, first + 10)); c.error(Error('connection lost')) } }), { status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${first}-${last}/${bytes.length}` } })
    }
    return new Response(bytes.slice(first, last + 1), { status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${first}-${last}/${bytes.length}` } })
  })
  await api.downloadAdhkarForOffline(input, new AbortController().signal)
  assert.equal(calls.filter(first => first === 0).length, 1)
  assert.equal(calls.filter(first => first === 512 * 1024).length, 2)
  assert.equal(await api.isAdhkarAudioSaved(input), true)
  const saved = await (await api.caches.open(api.ADHKAR_AUDIO_CACHE)).match(input)
  assert.deepEqual(new Uint8Array(await saved.arrayBuffer()), bytes)
  assert.equal(saved.status, 200); assert.equal(saved.headers.get('Content-Range'), null)
})
test('source changes during download are rejected and never become an offline recording', async () => {
  const bytes = new Uint8Array(512 * 1024 + 10)
  const api = downloader(async (_url, options) => {
    const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range), first = Number(a), last = Math.min(Number(b), bytes.length - 1)
    return new Response(bytes.slice(first, last + 1), { status: 206, headers: { 'Content-Type': 'audio/mpeg', 'Content-Range': `bytes ${first}-${last}/${bytes.length}`, ETag: first ? 'changed' : 'original' } })
  })
  await assert.rejects(api.downloadAdhkarForOffline(input, new AbortController().signal), /تغير ملف/)
  assert.equal(await api.isAdhkarAudioSaved(input), false)
})
test('the precached first-install corpus is available offline before the reading page was visited', async () => {
  const caches = memoryCaches(), raw = require('node:fs').readFileSync('public/data/adhkar.json', 'utf8')
  await (await caches.open('samee3-sw-v14-shell')).put('/data/adhkar.json', new Response(raw, { headers: { 'Content-Type': 'application/json' } }))
  const catalog = load('lib/adhkar-catalog.ts', { caches, TextDecoder, navigator: { onLine: false }, fetch: () => { throw Error('network should not be used') } })
  const result = await catalog.loadAdhkarCatalog()
  assert.equal(result.categories.length, 132); assert.equal(result.origin, 'cache')
})

test('offline preparation finds build-specific caches and preserves public query keys', () => {
  const { currentOfflineCache, offlineRscKey } = load('lib/offline-navigation.ts')
  assert.equal(currentOfflineCache(['samee3-audio-v2', 'samee3-sw-v13-build-one-navigation', 'samee3-sw-v14-build-two-navigation'], 'navigation'), 'samee3-sw-v14-build-two-navigation')
  assert.equal(currentOfflineCache(['samee3-sw-v14-build-one-assets', 'samee3-sw-v14-build-two-assets'], 'assets'), 'samee3-sw-v14-build-two-assets')
  assert.equal(currentOfflineCache(['samee3-sw-v9-rsc'], 'rsc'), 'samee3-sw-v9-rsc')
  assert.equal(offlineRscKey('/adhkar/read?type=morning&_rsc=random', 'https://samee3.test'), offlineRscKey('/adhkar/read?type=morning', 'https://samee3.test'))
  assert.notEqual(offlineRscKey('/notifications/hadith?id=1', 'https://samee3.test'), offlineRscKey('/notifications/hadith?id=2', 'https://samee3.test'))
})
function worker(caches) {
  const vm = require('node:vm'), fs = require('node:fs')
  const context = { Response, Request, Headers, URL, ReadableStream, Blob, setTimeout, clearTimeout, console, importScripts() {}, caches,
    self: { location: new URL('https://samee3.test'), addEventListener() {} }, fetch: async () => { throw Error('offline') } }
  vm.createContext(context); vm.runInContext(fs.readFileSync('public/sw.js', 'utf8'), context)
  return context
}
test('offline client navigation reuses a prepared full Flight response across router hashes', async () => {
  const caches = memoryCaches(), sw = worker(caches)
  const cache = await caches.open(require('node:vm').runInContext('RSC_CACHE', sw))
  await cache.put(sw.offlineRscKey('/adhkar/read'), new Response('prepared-flight', { headers: { 'Content-Type': 'text/x-component', Vary: 'RSC, Next-Router-State-Tree' } }))
  const response = await sw.publicRsc(new Request('https://samee3.test/adhkar/read?type=evening&_rsc=new-hash', { headers: { RSC: '1', 'Next-Router-State-Tree': 'changed-tree' } }))
  assert.equal(await response.text(), 'prepared-flight')
  assert.equal(response.headers.get('Content-Type'), 'text/x-component')
  await cache.put(sw.offlineRscKey('/notifications/hadith'), new Response('wrong-hadith'))
  assert.equal((await sw.publicRsc(new Request('https://samee3.test/notifications/hadith?id=another&_rsc=hash'))).status, 503)
})
test('the saved library worker streams only the requested byte range without a page Blob', async () => {
  const caches = memoryCaches(), sw = worker(caches), cache = await caches.open('samee3-audio-v2')
  await cache.put('https://server.test/001.mp3', new Response(new Uint8Array([1,2,3,4,5,6]), { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '6' } }))
  const url = new URL('https://samee3.test/__samee3_library_offline?url='+encodeURIComponent('https://server.test/001.mp3'))
  const response = await sw.serveSavedLibraryAudio(new Request(url, { headers: { Range: 'bytes=2-4' } }), url)
  assert.equal(response.status, 206); assert.equal(response.headers.get('Content-Range'), 'bytes 2-4/6')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([3,4,5]))
})

test('local complete recordings and context clips download as whole offline files',async()=>{
 const bytes=new Uint8Array([1,2,3,4,5,6])
 const api=downloader(async()=>new Response(bytes,{status:206,headers:{'Content-Type':'audio/mpeg','Content-Length':'6','Content-Range':'bytes 0-5/6'}}))
 for(const url of ['/audio/adhkar/mishary-alafasy/sections/103.mp3','/audio/adhkar/mohamed-jibril/001/004-108-evening.mp3']){
  await api.downloadAdhkarForOffline(url,new AbortController().signal)
  assert.equal(await api.isAdhkarAudioSaved(url),true)
  const response=await(await api.caches.open(api.ADHKAR_AUDIO_CACHE)).match(url)
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes)
 }
})

test('the complete recordings page can reopen offline with another reader filter',async()=>{
 const caches=memoryCaches(),sw=worker(caches),cache=await caches.open(require('node:vm').runInContext('RSC_CACHE',sw))
 await cache.put(sw.offlineRscKey('/adhkar/recordings'),new Response('recordings-flight',{headers:{'Content-Type':'text/x-component',Vary:'RSC, Next-Router-State-Tree'}}))
 const response=await sw.publicRsc(new Request('https://samee3.test/adhkar/recordings?reciter=mishary-alafasy&_rsc=changed',{headers:{RSC:'1','Next-Router-State-Tree':'changed-tree'}}))
 assert.equal(response.status,200);assert.equal(await response.text(),'recordings-flight')
 assert.ok(load('lib/offline-navigation.ts').QUERY_INDEPENDENT_ROUTES.has('/adhkar/recordings'))
})
