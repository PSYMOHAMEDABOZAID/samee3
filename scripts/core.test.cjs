const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const zlib = require('node:zlib')
const load = require('./load-ts.cjs')
const { seekAudioBeforePlay, activeAyahAt } = load('lib/quran/playback.ts')
class FakeAudio extends EventTarget {
 constructor(){super();this.readyState=0;this.duration=1000;this.seeking=false;this.position=0}
 get currentTime(){return this.position}
 set currentTime(value){if(this.readyState<1)throw new Error('No metadata');this.position=value;this.seeking=value>0;setTimeout(()=>{this.seeking=false;this.dispatchEvent(new Event('seeked'))},3)}
}
test('slow metadata never resets a requested ayah to the beginning',async()=>{
 const audio=new FakeAudio();const waiting=seekAudioBeforePlay(audio,137.5,()=>true,2500)
 setTimeout(()=>{audio.readyState=1;audio.dispatchEvent(new Event('loadedmetadata'))},1100)
 await waiting;assert.equal(audio.currentTime,137.5)
})
test('seek rejects unavailable timing and cancelled operations',async()=>{
 const audio=new FakeAudio();await assert.rejects(seekAudioBeforePlay(audio,20,()=>true,15))
 audio.readyState=1;await assert.rejects(seekAudioBeforePlay(audio,20,()=>false,50),{name:'AbortError'})
 await assert.rejects(seekAudioBeforePlay(audio,1500,()=>true,50))
})
test('all 1208 local page entries are readable and every glyph resolves',()=>{
 const index=require('../data/mushaf/index.json')
 for(const riwaya of ['sousi','bazzi']){
  const pack=fs.readFileSync(`data/mushaf/${riwaya}.pack`)
  const glyphs=JSON.parse(zlib.gunzipSync(fs.readFileSync(`data/mushaf/${riwaya}.glyphs.gz`)))
  assert.equal(index[riwaya].length,604)
  for(const [i,entry]of index[riwaya].entries()){
   const svg=zlib.gunzipSync(pack.subarray(entry.offset,entry.offset+entry.length)).toString()
   assert.ok(svg.startsWith('<svg'),`${riwaya}:${i+1}`);assert.ok(svg.trim().endsWith('</svg>'))
   assert.ok(entry.width>100&&entry.height>100)
   for(const id of svg.match(/g[0-9a-f]{20}/g)||[])assert.ok(glyphs[id],`Missing ${riwaya}:${id}`)
   assert.ok(!/<script\b|onload=/i.test(svg))
  }
  const text=JSON.parse(zlib.gunzipSync(fs.readFileSync(`data/mushaf/${riwaya}.text.json.gz`)))
  assert.equal(text.surahs.length,114)
  const pages=new Set(text.surahs.flatMap(s=>s.ayahs.map(a=>a.page_number)))
  for(let page=1;page<=604;page++)assert.ok(pages.has(page),`Missing ${riwaya} page ${page}`)
 }
})
test('each learning level contains all eight unique categories',()=>{
 const { LEARNING_LEVELS,LEARNING_COURSES,coursesInLevel,youtubeEmbed }=load('lib/islamic/curriculum.ts')
 assert.equal(LEARNING_COURSES.length,24)
 assert.equal(new Set(LEARNING_COURSES.map(x=>x.id)).size,24)
 for(const level of LEARNING_LEVELS){const books=coursesInLevel(level.id);assert.equal(books.length,8);assert.equal(new Set(books.map(x=>x.category)).size,8)}
 assert.equal(youtubeEmbed('https://evil.test/watch?v=abcdefghijk'),null)
 assert.equal(youtubeEmbed('javascript:alert(1)'),null)
 assert.ok(youtubeEmbed('https://www.youtube.com/playlist?list=PL12345678901234').includes('/videoseries?list='))
})
test('long card text is paginated without dropping words',async()=>{
 const ctx={font:'',measureText:(text)=>({width:[...text].length*22})}
 const document={fonts:{load:async()=>[],ready:Promise.resolve()},createElement:()=>({getContext:()=>ctx})}
 const {prepareCardPages,DEFAULT_CARD_OPTIONS}=load('lib/share-card.ts',{document})
 const text=Array.from({length:900},(_,i)=>`كلمة${i}`).join(' ')
 const pages=await prepareCardPages({kind:'hadith',title:'عنوان موثق',text,reference:'مرجع الحديث'},{...DEFAULT_CARD_OPTIONS,format:'square',fontSize:42})
 assert.ok(pages.length>1)
 assert.equal(pages.flatMap(p=>p.lines.map(l=>l.text)).join(' '),text)
 assert.ok(pages.every(p=>p.height===1080))
})
test('bundled adhkar are the complete source snapshot with unchanged text',()=>{
 const {createHash}=require('node:crypto')
 const raw=fs.readFileSync('public/data/adhkar.json')
 const provenance=require('../public/data/adhkar-source.json')
 assert.equal(createHash('sha256').update(raw).digest('hex'),provenance.sha256)
 const corpus=JSON.parse(raw),{parseAdhkarCategories}=load('lib/adhkar-catalog.ts')
 const parsed=parseAdhkarCategories(corpus)
 assert.equal(parsed.length,132);assert.equal(parsed.flatMap(x=>x.array).length,267)
 for(let i=0;i<corpus.length;i++) for(let j=0;j<corpus[i].array.length;j++) assert.equal(parsed[i].array[j].text,corpus[i].array[j].text.trim())
})

test('seeking to an exact timing boundary highlights the new ayah immediately',()=>{
 const timings=[{ayah:1,start_time:0,end_time:137500},{ayah:5,start_time:137500,end_time:220000},{ayah:6,start_time:220000,end_time:300000}]
 assert.equal(activeAyahAt(timings,137.49),1)
 assert.equal(activeAyahAt(timings,137.5),5)
 assert.equal(activeAyahAt(timings,220),6)
 assert.equal(activeAyahAt([],0),null)
 assert.equal(activeAyahAt(timings,NaN),null)
})
test('tafsir follows published references when a riwaya merges Hafs ayahs',()=>{
 const {tafsirReferences}=load('lib/quran/tafsir-reference.ts')
 for(const riwaya of ['sousi','bazzi']){
  const mushaf=JSON.parse(zlib.gunzipSync(fs.readFileSync(`data/mushaf/${riwaya}.text.json.gz`)))
  const opening=mushaf.surahs[1].ayahs[0],sixth=mushaf.surahs[1].ayahs.find(a=>a.number===5)
  assert.deepEqual(tafsirReferences({numberInSurah:opening.number,hafsNumbers:opening.number_in_hafs}),[1,2])
  assert.deepEqual(tafsirReferences({numberInSurah:sixth.number,hafsNumbers:sixth.number_in_hafs}),[6])
 }
 assert.deepEqual(tafsirReferences({numberInSurah:255}),[255])
})

test('Quran page API retains the full published tafsir mapping',async()=>{
 const {NextRequest}=require('next/server'),{GET}=load('app/api/quran/route.ts')
 for(const riwaya of ['sousi','bazzi']){
  const opening=await (await GET(new NextRequest(`http://localhost/api/quran?riwaya=${riwaya}&page=2`))).json()
  const first=opening.ayahs.find(a=>a.surah.number===2&&a.numberInSurah===1)
  assert.deepEqual(first.hafsNumbers,[1,2])
  const page=await (await GET(new NextRequest(`http://localhost/api/quran?riwaya=${riwaya}&page=3`))).json()
  assert.deepEqual(page.ayahs[0].hafsNumbers,[6])
 }
})

test('ayah selection resolves the complete key in multi-surah and non-Hafs pages',()=>{
 const {ayahForElement}=load('lib/quran/ayah-identity.ts')
 const ayahs=[{number:8,numberInSurah:1,surah:{number:2}},{number:9,numberInSurah:2,surah:{number:2}},{number:10,numberInSurah:1,surah:{number:3}}]
 const node=(attrs)=>({getAttribute:(name)=>attrs[name]??null})
 assert.equal(ayahForElement(node({'data-ayah':'2:1','data-surah':'2','data-ayah-number':'1'}),ayahs),ayahs[0])
 assert.equal(ayahForElement(node({'data-ayah':'3:1'}),ayahs),ayahs[2])
 assert.equal(ayahForElement(node({surah:'2',ayah:'2'}),ayahs),ayahs[1])
 assert.equal(ayahForElement(node({'data-ayah':'3:2'}),ayahs),null)
 assert.equal(ayahForElement(node({'data-global-ayah':'9'}),ayahs),ayahs[1])
})

test('bookmarks with equal numeric IDs remain separate across readings',()=>{
 const {bookmarkIdentity,matchesBookmark}=load('lib/quran/ayah-identity.ts')
 const ayah={number:8,numberInSurah:1,key:'2:1',surah:{number:2}}
 const hafs={number:8,key:'2:1',riwaya:'hafs'},sousi={...hafs,riwaya:'sousi'}
 assert.notEqual(bookmarkIdentity(hafs),bookmarkIdentity(sousi))
 assert.equal(matchesBookmark(hafs,ayah,'hafs'),true)
 assert.equal(matchesBookmark(sousi,ayah,'hafs'),false)
 assert.equal(matchesBookmark({number:8},ayah,'hafs'),true)
 assert.equal(matchesBookmark({number:8},ayah,'sousi'),false)
})

test('download completion excludes obsolete schemas, unrelated queries and foreign origins',()=>{
 const {cachedPagePart,pageDataUrl,pageSvgUrl,pageImageUrl}=load('lib/quran/mushaf-cache.ts')
 const origin='https://samee3.test'
 for(const [url,part] of [[pageDataUrl('hafs',1),1],[pageSvgUrl('sousi',604),2],[pageImageUrl('bazzi',99),4]])assert.equal(cachedPagePart(url,origin).part,part)
 for(const url of ['/api/quran?riwaya=hafs&page=1&v=5','/api/mushaf-svg?riwaya=hafs&page=1&v=4','/api/quran?riwaya=hafs&mode=index&v=1','https://elsewhere.test/api/quran?riwaya=hafs&page=1&v=6','/api/quran?riwaya=hafs&page=605&v=6'])assert.equal(cachedPagePart(url,origin),null)
})

test('highlight ends at the declared end and does not leak across timing gaps',()=>{
 const rows=[{ayah:1,start_time:1000,end_time:3000},{ayah:2,start_time:5000,end_time:7000}]
 assert.equal(activeAyahAt(rows,0),null)
 assert.equal(activeAyahAt(rows,2),1)
 assert.equal(activeAyahAt(rows,4),null)
 assert.equal(activeAyahAt(rows,5),2)
 assert.equal(activeAyahAt(rows,8),null)
 assert.equal(activeAyahAt([{ayah:1,start_time:NaN}],1),null)
})

test('local reading indexes cover all pages and map merged Hafs references and juz correctly',async()=>{
 const {NextRequest}=require('next/server'),{GET}=load('app/api/quran/route.ts')
 const {readingReference,parseReadingMap,juzForAyah}=load('lib/quran/reading-map.ts')
 for(const riwaya of ['sousi','bazzi']){
  const data=await(await GET(new NextRequest(`http://localhost/api/quran?riwaya=${riwaya}&mode=index&v=1`))).json()
  const rows=parseReadingMap(data.locations)
  assert.ok(rows.length>6000);assert.equal(new Set(rows.map(r=>r.page)).size,604)
  assert.equal(new Set(rows.map(r=>r.surah)).size,114)
  const first=readingReference(rows,2,1,'hafs'),second=readingReference(rows,2,2,'hafs')
  assert.equal(first,second);assert.equal(first.ayah,1);assert.equal(first.page,2)
  const start=readingReference(rows,2,142,'hafs');assert.ok(start)
  assert.equal(juzForAyah(start.surah,start.ayah,start.hafsNumbers),2)
  const page=await(await GET(new NextRequest(`http://localhost/api/quran?riwaya=${riwaya}&page=562`))).json()
  assert.equal(page.ayahs[0].juz,29)
 }
})

test('juz 11 starts at Hafs 9:93 and is translated to each reading without losing the preceding ayah',async()=>{
 const {HAFS_JUZ_RANGES}=load('lib/quran/juz-boundaries.ts'),{juzForAyah}=load('lib/quran/reading-map.ts')
 assert.equal(HAFS_JUZ_RANGES.length,30)
 assert.deepEqual(HAFS_JUZ_RANGES[9].end,{surah:9,ayah:92})
 assert.deepEqual(HAFS_JUZ_RANGES[10].start,{surah:9,ayah:93})
 assert.equal(juzForAyah(9,92),10);assert.equal(juzForAyah(9,93),11)
 const {GET}=load('app/api/quran/route.ts'),{NextRequest}=require('next/server')
 for(const riwaya of ['sousi','bazzi']){
  const data=await(await GET(new NextRequest(`http://localhost/api/quran?riwaya=${riwaya}&page=201`))).json()
  assert.equal(data.ayahs.find((ayah)=>ayah.hafsNumbers.includes(92)).juz,10)
  assert.equal(data.ayahs.find((ayah)=>ayah.hafsNumbers.includes(93)).juz,11)
 }
})

function workerContext(overrides={}){
 const vm=require('node:vm'),events={}
 const context={URL,Request,Response,Headers,Blob,ReadableStream,console,setTimeout,clearTimeout,
  self:{location:{origin:'https://samee3.test'},addEventListener:(name,fn)=>{events[name]=fn},clients:{claim:async()=>{}},skipWaiting:async()=>{throw Error('Unexpected activation')}},
  caches:{open:async()=>({match:async()=>null,put:async()=>{}}),keys:async()=>[],delete:async()=>true},
  fetch:async()=>{throw Error('Offline')},...overrides}
 vm.createContext(context);vm.runInContext(fs.readFileSync('public/sw.js','utf8'),context)
 return {context,events}
}

test('offline worker serves precached fonts, manifest and adhkar without another network request',async()=>{
 const {context}=workerContext({caches:{open:async(name)=>({match:async()=>name.endsWith('-shell')?new Response('saved'):null})}})
 for(const path of ['/fonts/sousi-source.ttf','/manifest.json','/data/adhkar.json']){
  assert.equal(context.isStaticAsset(new URL('https://samee3.test'+path)),true)
  assert.equal(await(await context.staticAsset(new Request('https://samee3.test'+path))).text(),'saved')
 }
 assert.equal(context.isQuranPageRequest(new Request('https://samee3.test/api/quran?riwaya=sousi&mode=index&v=1'),new URL('https://samee3.test/api/quran?riwaya=sousi&mode=index&v=1')),true)
})

test('storage failures never discard successful online Quran, assets or navigation responses',async()=>{
 const {context}=workerContext({caches:{open:async()=>{throw Error('Storage blocked')}},fetch:async()=>new Response('online',{headers:{'Content-Type':'text/html'}})})
 const url=new URL('https://samee3.test/mushaf'),request=new Request(url)
 for(const result of [context.staticAsset(request),context.shellPage(request,url),context.publicRsc(request),context.serveQuranPage(new Request('https://samee3.test/api/quran?riwaya=hafs&page=1&v=6'),new URL('https://samee3.test/api/quran?riwaya=hafs&page=1&v=6'))])assert.equal(await(await result).text(),'online')
})

test('cached audio range handling supports long surahs and rejects unsatisfiable ranges',async()=>{
 const size=70*1024*1024
 const saved=()=>{let left=size;return new Response(new ReadableStream({pull(controller){if(!left){controller.close();return}const length=Math.min(left,1024*1024);controller.enqueue(new Uint8Array(length));left-=length}}),{headers:{'Content-Type':'audio/mpeg','Content-Length':String(size)}})}
 const {context}=workerContext({caches:{open:async()=>({match:async()=>saved()})}})
 const response=await context.serveQuranAudio(new Request('https://server8.mp3quran.net/afs/002.mp3',{headers:{Range:`bytes=${size-8}-`}}))
 assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,8)
 assert.equal(response.headers.get('Content-Range'),`bytes ${size-8}-${size-1}/${size}`)
 const invalid=await context.serveQuranAudio(new Request('https://server8.mp3quran.net/afs/002.mp3',{headers:{Range:`bytes=${size+1}-`}}))
 assert.equal(invalid.status,416)
})

test('offline startup defers optional Firebase Analytics until the connection returns',async()=>{
 let starts=0
 const listeners={},navigator={onLine:false}
 const mocks={getApps:()=>[],initializeApp:()=>({}),getAuth:()=>({}),getFirestore:()=>({}),isSupported:async()=>true,getAnalytics:()=>{starts++;return {}}}
 load('lib/firebase.ts',{require:()=>mocks,navigator,window:{addEventListener:(event,fn)=>{listeners[event]=fn}}})
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(starts,0)
 navigator.onLine=true;listeners.online()
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(starts,1)
 listeners.online();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(starts,1)
})

test('prayer countdown skips sunrise and uses the actual following day',()=>{
 const {nextPrayerFromDays,prayerInstant}=load('lib/prayer-times.ts')
 const timings={Fajr:'05:00',Sunrise:'06:20',Dhuhr:'12:00',Asr:'15:00',Maghrib:'18:00',Isha:'19:30'}
 const today={date:'2026-10-28',timezone:'Asia/Muscat',timings,hijri:'',gregorian:''}
 const tomorrow={...today,date:'2026-10-29',timings:{...timings,Fajr:'04:59'}}
 assert.equal(nextPrayerFromDays([today,tomorrow],new Date('2026-10-28T01:30:00Z')).id,'Dhuhr')
 const next=nextPrayerFromDays([today,tomorrow],new Date('2026-10-28T19:00:00Z'))
 assert.equal(next.id,'Fajr');assert.equal(next.time,'04:59');assert.equal(next.isTomorrow,true)
 assert.equal(next.at,Date.parse('2026-10-29T00:59:00Z'))
 assert.equal(prayerInstant('2026-03-08','05:00','America/New_York'),Date.parse('2026-03-08T09:00:00Z'))
 assert.equal(nextPrayerFromDays([today],new Date('2026-10-30T00:00:00Z')),null)
})

test('prayer source rejects malformed clocks and invalid dates',()=>{
 const {parsePrayerDay,qiblaBearing}=load('lib/prayer-times.ts')
 const payload={code:200,data:{meta:{timezone:'Asia/Muscat'},date:{gregorian:{date:'28-10-2026'}},timings:{Fajr:'05:00',Sunrise:'06:20',Dhuhr:'12:00',Asr:'15:00',Maghrib:'18:00',Isha:'19:30'}}}
 assert.equal(parsePrayerDay(payload).date,'2026-10-28')
 assert.throws(()=>parsePrayerDay({...payload,data:{...payload.data,timings:{...payload.data.timings,Fajr:'99:99'}}}))
 assert.throws(()=>parsePrayerDay({...payload,data:{...payload.data,date:{gregorian:{date:'31-02-2026'}}}}))
 assert.ok(Math.abs(qiblaBearing(30,39.8262)-180)<0.001)
 assert.ok(Math.abs(qiblaBearing(10,39.8262))<0.001)
 assert.equal(parsePrayerDay({...payload,data:{...payload.data,timings:{...payload.data.timings,Fajr:' 05:00 '}}}).timings.Fajr,'05:00')
})

test('a prayer request timeout does not abort its parent or discard the valid day',async()=>{
 const payload={code:200,data:{meta:{timezone:'Asia/Muscat'},date:{gregorian:{date:'28-10-2026'}},timings:{Fajr:'05:00',Sunrise:'06:20',Dhuhr:'12:00',Asr:'15:00',Maghrib:'18:00',Isha:'19:30'}}}
 const {fetchPrayerDay}=load('lib/prayer-times.ts',{AbortController,fetch:async(url,{signal})=>{
  if(url.endsWith('today'))return new Response(JSON.stringify(payload))
  return new Promise((resolve,reject)=>{const cancel=()=>reject(new DOMException('cancelled','AbortError'));if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true})})
 }})
 const controller=new AbortController(),today=await fetchPrayerDay('https://samee3.test/today',controller.signal,100)
 await assert.rejects(fetchPrayerDay('https://samee3.test/tomorrow',controller.signal,5),{name:'AbortError'})
 assert.equal(controller.signal.aborted,false);assert.equal(today.date,'2026-10-28')
 controller.abort();await assert.rejects(fetchPrayerDay('https://samee3.test/tomorrow',controller.signal,100),{name:'AbortError'})
})

test('background gallery excludes empty videos and serves local files without waiting for GitHub',async()=>{
 let calls=0
 const {GET}=load('app/api/visual-backgrounds/route.ts',{process:{cwd:()=>process.cwd()},fetch:async()=>{calls+=1;throw Error('offline')}})
 const result=await(await GET()).json()
 assert.ok(result.files.length>0);assert.ok(result.files.every((item)=>item.size>=1024))
 assert.equal(result.files.some((item)=>item.filename==='sky-plane.mp4'),false)
 assert.equal(calls,0)
})

test('login return paths cannot leave the application after URL normalization',()=>{
 const {safeReturnPath}=load('lib/navigation.ts')
 assert.equal(safeReturnPath('/islamic-library?x=1#book'),'/islamic-library?x=1#book')
 for(const value of ['//evil.test','/\\evil.test','/\n/evil.test','https://evil.test','/x/../auth','/auth?next=//evil.test'])assert.equal(safeReturnPath(value),'/profile')
})

test('large ZIP entries compress without writable-stream deadlock and round-trip exactly',async()=>{
 const {compressZipEntry}=load('lib/zip.ts')
 const input=Buffer.alloc(2*1024*1024,65)
 const packed=await compressZipEntry(input,AbortSignal.timeout(3000))
 assert.equal(packed.method,8)
 assert.deepEqual(zlib.inflateRawSync(packed.data),input)
 const controller=new AbortController();controller.abort()
 await assert.rejects(compressZipEntry(input,controller.signal),{name:'AbortError'})
})

test('download prompt readiness requires every current-schema page part',async()=>{
 const origin='https://samee3.test',keys=[]
 const {pageDataUrl,pageSvgUrl,pageImageUrl}=load('lib/quran/mushaf-cache.ts')
 for(let page=1;page<=604;page++){keys.push({url:origin+pageDataUrl('hafs',page)},{url:origin+pageSvgUrl('hafs',page)})}
 keys.push({url:origin+pageDataUrl('sousi',1)},{url:origin+pageSvgUrl('sousi',1)})
 const options={window:{caches:{}},location:{origin},caches:{keys:async()=>['samee3-mushaf-pages-v2'],open:async()=>({keys:async()=>keys})}}
 const {inspectMushafDownloads}=load('lib/quran/mushaf-downloads.ts',options)
 let report=await inspectMushafDownloads();assert.equal(report.completed.hafs.size,604);assert.equal(report.completed.sousi.size,0)
 keys.push({url:origin+pageImageUrl('sousi',1)});report=await inspectMushafDownloads();assert.equal(report.completed.sousi.size,1)
 keys.splice(1,1);report=await inspectMushafDownloads();assert.equal(report.completed.hafs.size,603)
})

test('starting another section stops persistent Quran and cancels its pending continuation',()=>{
 const quran={__samee3Continue:true,__samee3Serial:7,__samee3Switching:true,pause(){this.paused=true}}
 const {claimAudioFocus}=load('lib/audio-focus.ts',{window:{__samee3PersistentAudio:quran}})
 const first={pause(){this.paused=true}},second={pause(){this.paused=true}}
 claimAudioFocus(first);assert.equal(quran.paused,true);assert.equal(quran.__samee3Continue,false);assert.equal(quran.__samee3Serial,8)
 claimAudioFocus(second);assert.equal(first.paused,true)
})

test('Quran downloads from the legacy index cache can be resolved by the shared player',async()=>{
 const {resolveOfflineAudio,releaseOfflineAudio}=load('lib/samee3-audio-offline.ts',{location:{origin:'https://samee3.test'},caches:{keys:async()=>['samee3-quran-audio-v1'],open:async()=>({match:async()=>new Response(new Blob(['audio']),{headers:{'Content-Type':'audio/mpeg'}})})}})
 const source=await resolveOfflineAudio({url:'https://server8.mp3quran.net/afs/002.mp3',kind:'quran'})
 assert.equal(source.verified,true);assert.ok(source.objectUrl);releaseOfflineAudio(source)
})
