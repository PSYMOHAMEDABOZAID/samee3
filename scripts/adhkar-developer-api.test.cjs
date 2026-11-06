const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-ts.cjs')
const { adhkarAudioCatalog: data, filterAdhkarAudio, adhkarReaderTimings, filterAdhkarSections } = load('lib/adhkar-developer-api.ts')
const { localAdhkarAudio } = load('lib/adhkar-local-audio.ts')

test('the public audio catalog keeps all existing dhikr texts and repetition counts unchanged', () => {
  const original = require('../public/data/adhkar.json')
  assert.equal(data.itemCount, 267)
  assert.equal(data.categories.length, 132)
  for (const category of original) for (const item of category.array) {
    const row = data.items.find(row => row.categoryId === category.id && row.itemId === item.id)
    assert.equal(row.text, item.text); assert.equal(row.repeatCount, item.count)
  }
})
test('every clip identifies its own reader and measured duration without substituting another voice', () => {
  let recordings = 0
  for (const item of data.items) for (const [reader, recording] of Object.entries(item.recordings)) {
    recordings++
    assert.ok(data.reciters.some(row => row.id === reader))
    assert.match(recording.url, new RegExp(`^/audio/adhkar/${reader}/\\d{3}/\\d{3}(?:-\\d{3}(?:-(?:morning|evening))?)?\\.mp3$`))
    assert.equal(recording.timing.startMs, 0)
    assert.equal(recording.timing.endMs, recording.durationMs)
    assert.ok(Number.isSafeInteger(recording.durationMs) && recording.durationMs > 0)
    assert.match(recording.sha256, /^[a-f0-9]{64}$/)
    assert.ok(recording.source.endMs > recording.source.startMs && recording.source.startMs >= 0)
    assert.equal(recording.alignment.manuallyReviewed, false)
    if (recording.alignment.method === 'audio-word-alignment') assert.ok(recording.alignment.textMatchScore >= 0.92)
    assert.equal(localAdhkarAudio(reader, { audio: `/audio/${item.originalAudioId}.mp3` }), recording.url)
  }
  assert.equal(recordings, data.recordingCount)
  assert.equal(localAdhkarAudio('__proto__', { audio: '/audio/75.mp3' }), null)
  assert.equal(localAdhkarAudio('hamad-al-drehem', { audio: '/audio/not-a-dhikr.mp3' }), null)
})
test('coverage counts and missing items are explicit for each reader', () => {
  for (const reader of data.reciters) {
    const available = data.items.filter(item => item.recordings[reader.id])
    assert.equal(reader.individualAudioCount, available.length)
    assert.equal(reader.coverage === 'complete', available.length === data.items.length)
    assert.equal(adhkarReaderTimings(reader.id).items.length, available.length)
  }
  assert.equal(data.reciters.find(row => row.id === 'hamad-al-drehem').individualAudioCount, 267)
})
test('developer pagination never drops or duplicates a dhikr', () => {
  let offset = 0; const ids = []
  for (;;) {
    const page = filterAdhkarAudio(new URLSearchParams({ reciter: 'hamad-al-drehem', limit: '100', offset: String(offset) }))
    ids.push(...page.items.map(item => item.id))
    if (page.nextOffset === null) break
    offset = page.nextOffset
  }
  assert.equal(ids.length, 267); assert.equal(new Set(ids).size, 267)
})
test('filters expose only the requested voice; invalid values cannot select arbitrary paths', () => {
  for (const reader of data.reciters) {
    const result = filterAdhkarAudio(new URLSearchParams({ reciter: reader.id, category: '1', limit: '100' }))
    for (const row of result.items) assert.deepEqual(Object.keys(row.recordings), [reader.id])
  }
  for (const q of ['reciter=../x', 'category=-1', 'limit=999', 'offset=NaN', 'limit=0']) assert.throws(() => filterAdhkarAudio(new URLSearchParams(q)))
  assert.equal(adhkarReaderTimings('../x'), null)
})
test('public API responses include CORS while errors remain uncached', async () => {
  const { GET, OPTIONS } = load('app/api/adhkar/v1/items/route.ts')
  const ok = GET(new Request('https://samee3.test/api/adhkar/v1/items?category=1&reciter=hamad-al-drehem'))
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('Access-Control-Allow-Origin'), '*')
  assert.ok((await ok.json()).items.length > 0)
  const invalid = GET(new Request('https://samee3.test/api/adhkar/v1/items?limit=999'))
  assert.equal(invalid.status, 400); assert.equal(invalid.headers.get('Cache-Control'), 'no-store')
  assert.equal(OPTIONS().status, 204)
})
test('static audio preflight permits cross-origin Range requests without intercepting GET streaming', () => {
  const { proxy, config } = load('proxy.ts')
  const preflight = proxy(new Request('https://samee3.test/audio/adhkar/reader/001/001.mp3', {method:'OPTIONS'}))
  assert.equal(preflight.status,204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
  assert.ok(preflight.headers.get('access-control-allow-headers').split(', ').includes('Range'))
  const ordinary = proxy(new Request('https://samee3.test/audio/adhkar/reader/001/001.mp3'))
  assert.equal(ordinary.headers.get('x-middleware-next'), '1')
  assert.ok(config.matcher.every(rule => rule.has.some(condition => condition.key === 'access-control-request-method')))
})
test('local offline media URLs stay same-origin and cannot be used as an external proxy', async () => {
  const caches = { open: async () => ({ match: async () => undefined }) }
  const { isAdhkarAudioSaved } = load('lib/adhkar-offline.ts', { window: { caches }, location: { origin: 'https://samee3.test' }, caches })
  assert.equal(await isAdhkarAudioSaved('https://evil.test/audio/adhkar/hamad-al-drehem/001/001.mp3'), false)
  assert.equal(await isAdhkarAudioSaved('/audio/adhkar/../../private.mp3'), false)
  assert.equal(await isAdhkarAudioSaved('/audio/adhkar/hamad-al-drehem/001/001.mp3'), false)
})

test('all 626 previous recordings are preserved at the same URLs and hashes',()=>{
 const baseline=require('../docs/ADHKAR-V1-BASELINE.json');assert.equal(baseline.length,626)
 for(const old of baseline){const row=data.items.find(i=>i.id===old.itemId);assert.equal(row.recordings[old.reader].url,old.url);assert.equal(row.recordings[old.reader].sha256,old.sha256)}
})
test('all previous and additional named readers have real individual recordings',()=>{
 for(const id of ['hamad-al-drehem','sulaiman-al-shuhayhi','faris-abbad','walid-abu-ziyad','mishary-alafasy','mohamed-jibril','nasser-alqatami','saad-alghamdi','idrees-abkar','hani-alrifai','salman-alotaibi'])assert.ok(data.reciters.some(r=>r.id===id&&r.individualAudioCount>0),id)
})
test('morning/evening variants select only the requested wording',()=>{
 let count=0
 for(const item of data.items)for(const [reader,contexts]of Object.entries(item.variants||{}))for(const [section,clip]of Object.entries(contexts)){
  count++;const page=filterAdhkarAudio(new URLSearchParams({reciter:reader,category:String(item.categoryId),item:String(item.itemId),section}))
  assert.equal(page.items[0].recordings[reader].url,clip.url);assert.equal(clip.contextSection,section)
  assert.equal(localAdhkarAudio(reader,{audio:'/audio/'+item.originalAudioId+'.mp3'},section),clip.url)
  assert.ok(clip.alignment.matchedText&&clip.alignment.textMatchScore>=.92)
 }
 assert.ok(count>0)
 for(const section of ['morning','evening'])for(const row of filterAdhkarAudio(new URLSearchParams({section,limit:'100'})).items)for(const clip of Object.values(row.recordings))assert.ok(!['morning','evening'].includes(clip.contextSection)||clip.contextSection===section)
 assert.throws(()=>filterAdhkarAudio(new URLSearchParams({section:'../invalid'})))
})
test('distinct audio file counts include context variants and complete sources accurately',()=>{
 const individual=new Set()
 for(const item of data.items){for(const c of Object.values(item.recordings))individual.add(c.url);for(const vv of Object.values(item.variants||{}))for(const c of Object.values(vv))individual.add(c.url)}
 const full=new Set(data.sectionRecordings.map(c=>c.url))
 assert.equal(data.individualAudioFileCount,individual.size);assert.equal(data.sectionRecordingCount,full.size);assert.equal(data.totalAudioFileCount,new Set([...individual,...full]).size)
 assert.equal(full.size,122)
 assert.equal(data.reciters.length,25)
 for(const reader of data.reciters)assert.ok(reader.individualAudioCount>0 || reader.sectionAudioCount>0,reader.id)
 for(const c of data.sectionRecordings){assert.match(c.url,new RegExp(`^/audio/adhkar/${c.readerId}/sections/\\d{3}\\.mp3$`));assert.equal(c.timing.startMs,0);assert.equal(c.timing.endMs,c.durationMs);assert.ok(data.rights.profiles.some(r=>r.id===c.rightsId))}
})
test('source filters and timing files cover all shipped complete recordings and variants',()=>{
 for(const reader of data.reciters){const selected=filterAdhkarSections(new URLSearchParams({reciter:reader.id}));assert.equal(selected.total,reader.sectionAudioCount);const timings=adhkarReaderTimings(reader.id);assert.equal(timings.sections.length,reader.sectionAudioCount);assert.deepEqual(timings,require('../public/data/adhkar-audio/v1/timings/'+reader.id+'.json'))}
 assert.throws(()=>filterAdhkarSections(new URLSearchParams({reciter:'unknown'})));assert.throws(()=>filterAdhkarSections(new URLSearchParams({category:'../../private'})))
})
test('offline media accepts complete recordings and variants but rejects foreign/traversal URLs',async()=>{
 const caches={open:async()=>({match:async()=>new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg','Content-Length':'3'}})})}
 const {isAdhkarAudioSaved}=load('lib/adhkar-offline.ts',{window:{caches},location:{origin:'https://samee3.test'},caches})
 assert.equal(await isAdhkarAudioSaved('/audio/adhkar/mishary-alafasy/sections/103.mp3'),true)
 assert.equal(await isAdhkarAudioSaved('/audio/adhkar/mohamed-jibril/001/004-108-evening.mp3'),true)
 assert.equal(await isAdhkarAudioSaved('https://evil.test/audio/adhkar/mishary-alafasy/sections/103.mp3'),false)
 assert.equal(await isAdhkarAudioSaved('/audio/adhkar/reader/sections/../../private.mp3'),false)
})
