const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-ts.cjs')
const { currentMediaDhikr, parseMediaDhikrs } = load('lib/adhkar-media.ts')
const settle = () => new Promise(resolve => setTimeout(resolve, 25))

class AudioElement extends EventTarget {
  src = 'https://samee3.test/audio/one.mp3'
  currentTime = 0; duration = 20; readyState = 4; paused = true; ended = false; playbackRate = 1
  getAttribute(name) { return name === 'src' ? this.src || null : null }
  querySelector() { return null }
  play() { this.paused = false; this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing')); return Promise.resolve() }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
}

function harness(fetchData = () => ({ items: [] })) {
  const actions = {}, artworks = [], requests = [], positions = [], cache = new Map()
  const session = { metadata: null, playbackState: 'none', setActionHandler: (name, fn) => { actions[name] = fn }, setPositionState: value => positions.push(value) }
  const media = load('lib/quran/media-session.ts', {
    window: { addEventListener() {} }, document: { addEventListener() {} },
    navigator: { mediaSession: session }, location: { href: 'https://samee3.test/adhkar', origin: 'https://samee3.test' },
    HTMLMediaElement: AudioElement, MediaMetadata: class { constructor(value) { Object.assign(this, value) } },
    AbortController, caches: { open: async () => ({ match: async url => cache.get(url)?.clone(), put: async (url, response) => { cache.set(url, response.clone()) } }) },
    fetch: async url => { requests.push(url); return Response.json(await fetchData(url)) },
    require: name => {
      if (name === './Samee3DataAdapter') return { RIWAYAT: [{ id: 'hafs', label: 'حفص' }], SURAH_NAMES_AR: ['الفاتحة'] }
      if (name === './media-artwork') return { createMediaArtwork: async value => { artworks.push(value); return 'data:image/png;base64,' + Buffer.from(value.text).toString('base64') } }
      if (name === '../audio-focus') return { bindAudioFocus() {} }
      if (name === '../adhkar-media') return load('lib/adhkar-media.ts')
      throw new Error('Unexpected import ' + name)
    },
  })
  return { media, session, actions, artworks, requests, positions }
}

test('dhikr detection respects exact starts, declared ends, gaps and backwards seeks', () => {
  const rows = [{ id: '1:1', number: 1, text: 'أول', startMs: 1000, endMs: 4000 }, { id: '1:2', number: 2, text: 'ثان', startMs: 6000, endMs: 9000 }]
  assert.equal(currentMediaDhikr(rows, .9), null)
  assert.equal(currentMediaDhikr(rows, 1).id, '1:1')
  assert.equal(currentMediaDhikr(rows, 4), null)
  assert.equal(currentMediaDhikr(rows, 5), null)
  assert.equal(currentMediaDhikr(rows, 6).id, '1:2')
  assert.equal(currentMediaDhikr(rows, 9), null)
  assert.equal(currentMediaDhikr(rows, 2).id, '1:1')
  assert.equal(currentMediaDhikr(rows, NaN), null)
  assert.equal(parseMediaDhikrs([{ ...rows[0], endMs: 0 }, null, rows[1]]).length, 1)
})

test('each separate dhikr updates system text, reader and a full-text cover instead of a generic recording title', async () => {
  const { media, session, artworks, actions } = harness()
  const audio = new AudioElement(); let next = 0
  media.bindQuranMediaSession(audio, { kind: 'adhkar', title: 'أذكار الصباح · الذكر ٢', subtitle: 'أذكار الصباح', audioUrl: audio.src, reciterName: 'القارئ الأول',
    adhkar: { section: 'أذكار الصباح', text: 'سبحان الله وبحمده', number: 2, total: 24 }, next: () => next++ })
  await audio.play(); await settle()
  assert.match(session.metadata.title, /سبحان الله وبحمده/)
  assert.match(session.metadata.title, /الذكر ٢/)
  assert.match(session.metadata.artist, /القارئ الأول/)
  assert.equal(artworks.at(-1).text, 'سبحان الله وبحمده')
  assert.equal(artworks.at(-1).kind, 'adhkar')
  assert.equal(artworks.at(-1).total, 24)
  actions.nexttrack(); assert.equal(next, 1)
  audio.src = 'https://samee3.test/audio/two.mp3'
  media.bindQuranMediaSession(audio, { kind: 'adhkar', title: 'التالي', subtitle: 'أذكار المساء', audioUrl: audio.src, reciterName: 'القارئ الثاني', adhkar: { section: 'أذكار المساء', text: 'الحمد لله', number: 3 } })
  await settle()
  assert.match(session.metadata.title, /الحمد لله/)
  assert.match(session.metadata.artist, /القارئ الثاني/)
  assert.equal(actions.nexttrack, null)
})

test('complete recordings change text at source-aligned boundaries and remote next/previous seek dhikr by dhikr', async () => {
  const rows = [{ id: '1:1', number: 1, text: 'الذكر الأول', startMs: 1000, endMs: 4000 }, { id: '1:2', number: 2, text: 'الذكر الثاني', startMs: 6000, endMs: 9000 }]
  const { media, session, actions, requests } = harness(() => ({ recording: { id: 'reader:one' }, items: rows }))
  const audio = new AudioElement(); audio.currentTime = 2
  media.bindQuranMediaSession(audio, { kind: 'adhkar', title: 'التسجيل الكامل', subtitle: 'المساء', audioUrl: audio.src, reciterName: 'القارئ',
    adhkar: { section: 'المساء', recordingId: 'reader:one' } })
  await audio.play(); await settle()
  assert.ok(requests[0].includes('reader%3Aone'))
  assert.match(session.metadata.title, /الذكر الأول/)
  actions.nexttrack(); assert.equal(audio.currentTime, 6); assert.match(session.metadata.title, /الذكر الثاني/)
  actions.previoustrack(); assert.equal(audio.currentTime, 1)
  audio.currentTime = 5; audio.dispatchEvent(new Event('timeupdate'))
  assert.equal(session.metadata.title, 'التسجيل الكامل')
  assert.ok(session.metadata.artwork.every(row => !row.src.startsWith('data:')))
})

test('timings from a different complete recording are rejected rather than showing the wrong dhikr', async () => {
  const { media, session } = harness(() => ({ recording: { id: 'another-reader:one' }, items: [{ id: '1:1', number: 1, text: 'نص خاطئ', startMs: 0, endMs: 20000 }] }))
  const audio = new AudioElement()
  media.bindQuranMediaSession(audio, { kind: 'adhkar', title: 'التسجيل', subtitle: '', audioUrl: audio.src, reciterName: 'الصوت الصحيح', adhkar: { section: 'الصباح', recordingId: 'reader:one' } })
  await audio.play(); await settle()
  assert.equal(session.metadata.title, 'التسجيل')
})

test('a late timing response cannot replace the currently playing reader or recording', async () => {
  let finishOld
  const old = new Promise(resolve => { finishOld = resolve })
  const { media, session } = harness(url => url.includes('reader%3Aold') ? old : { recording: { id: 'reader:new' }, items: [{ id: '1:2', number: 1, text: 'الذكر الحالي', startMs: 0, endMs: 20000 }] })
  const audio = new AudioElement()
  const track = id => ({ kind: 'adhkar', title: 'تسجيل', subtitle: '', audioUrl: audio.src, reciterName: id, adhkar: { section: 'الصباح', recordingId: id } })
  media.bindQuranMediaSession(audio, track('reader:old')); await audio.play(); await settle()
  audio.src = 'https://samee3.test/audio/new.mp3'
  media.bindQuranMediaSession(audio, track('reader:new')); await settle()
  finishOld({ recording: { id: 'reader:old' }, items: [{ id: '1:1', number: 1, text: 'النص القديم', startMs: 0, endMs: 20000 }] })
  await settle()
  assert.match(session.metadata.title, /الذكر الحالي/)
  assert.match(session.metadata.artist, /reader:new/)
})

test('complete-recording metadata prepared during download can be reused without another network request', async () => {
  const { media, session, requests } = harness(() => ({ recording: { id: 'reader:saved' }, items: [{ id: '1:1', number: 1, text: 'الذكر المحفوظ', startMs: 0, endMs: 20000 }] }))
  await media.prepareAdhkarMedia('reader:saved', new AbortController().signal)
  const audio = new AudioElement()
  media.bindQuranMediaSession(audio, { kind: 'adhkar', title: 'التسجيل', subtitle: '', audioUrl: audio.src, reciterName: 'القارئ', adhkar: { section: 'الصباح', recordingId: 'reader:saved' } })
  await audio.play(); await settle()
  assert.equal(requests.length, 1)
  assert.match(session.metadata.title, /الذكر المحفوظ/)
})

test('headset play and pause use the persistent player callbacks, including cancellation of pending playback', async () => {
  const { media, actions } = harness(); let played = 0, paused = 0
  const audio = new AudioElement()
  media.bindQuranMediaSession(audio, { kind: 'adhkar', title: 'ذكر', subtitle: '', audioUrl: audio.src, reciterName: 'القارئ',
    adhkar: { section: 'الصباح', text: 'ذكر', number: 1 }, play: () => played++, pause: () => paused++ })
  await audio.play()
  actions.pause(); actions.play(); actions.stop()
  assert.equal(played, 1); assert.equal(paused, 2)
})

test('Quran ayah artwork and declared timing boundaries remain unchanged', async () => {
  const { media, session, artworks } = harness(() => ({ riwaya: 'hafs', surah: 1, ayahs: [{ number: 1, text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ' }] }))
  const audio = new AudioElement()
  audio.__samee3Surah = 1; audio.__samee3Riwaya = 'hafs'; audio.__samee3ReciterName = 'قارئ المصحف'
  audio.__samee3Timings = [{ ayah: 1, start_time: 0, end_time: 4000 }]
  media.bindQuranMediaSession(audio); await audio.play(); await settle()
  assert.match(session.metadata.title, /الآية ١/)
  assert.equal(artworks.at(-1).kind, 'quran')
  audio.currentTime = 4; audio.dispatchEvent(new Event('timeupdate'))
  assert.equal(session.metadata.title, 'سورة الفاتحة')
})

test('the artwork renders the dhikr caption and retains every text word', async () => {
  const drawn = [], context = { font: '', fillRect() {}, strokeRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    measureText(value) { const font = Number(this.font.match(/(\d+)px/)?.[1]) || 20; return { width: value.length * font * .5, actualBoundingBoxAscent: font, actualBoundingBoxDescent: font * .3 } },
    fillText(value) { drawn.push(value) } }
  const artwork = load('lib/quran/media-artwork.ts', {
    document: { fonts: { load: async () => [] }, createElement: () => ({ getContext: () => context, toDataURL: () => 'data:image/png;base64,test' }) },
    Image: class { set src(value) { queueMicrotask(() => this.onload()) } }, location: { origin: 'https://samee3.test' },
  })
  const text = 'سبحان الله وبحمده سبحان الله العظيم'
  await artwork.createMediaArtwork({ text, surah: 'أذكار الصباح', ayah: 2, total: 24, reciter: 'القارئ', riwaya: 'أذكار سميع', kind: 'adhkar' })
  assert.ok(drawn.some(value => value.includes('الذكر ٢ من ٢٤')))
  assert.equal(drawn.some(value => value.includes('الآية')), false)
  assert.ok(drawn.join(' ').includes(text))
})
