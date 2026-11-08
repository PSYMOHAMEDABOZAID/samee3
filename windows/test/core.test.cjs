const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const C = require('../core.cjs')
const root = path.resolve(__dirname, '..')
const voices = require('../data/adhan-catalog.json').voices
const valid = patch => C.settings({ ...C.DEFAULTS, ...patch }, voices.map(v => v.id))

test('remote and local URL checks reject protocol confusion, credentials and lookalike hosts', () => {
  assert(C.websiteURL(C.SITE + '/mushaf'))
  for (const url of ['file:///etc/passwd','javascript:alert(1)','http://samee3.vercel.app','https://samee3.vercel.app.evil.test/','https://user@samee3.vercel.app/']) assert.equal(C.websiteURL(url), false, url)
  assert(C.localURL('samee3://app/ui/reader.html'))
  assert.equal(C.localURL('samee3://other/ui/reader.html'), false)
})
test('resource mapping cannot reach application code or files outside the resource folders', () => {
  assert.equal(C.resource('samee3://app/data/catalog.json', root), path.join(root,'data/catalog.json'))
  for(const url of ['samee3://app/main.cjs','samee3://app/ui/../../main.cjs','samee3://app/ui/%2e%2e/main.cjs','samee3://app/ui/%2e%2e%2fmain.cjs','samee3://app/data/%00secret','file:///etc/passwd','samee3://app/ui/%5c..%5csecret']) assert.equal(C.resource(url,root),null,url)
})
test('all reminders are opt-in and settings accept only bounded known values', () => {
  const s=valid({});for(const key of C.KEYS) assert.equal(C.enabled(s,key),false)
  for(const patch of [{quran:'yes'},{quranTime:'25:00'},{hadithHours:0},{hadithStart:22,hadithEnd:8},{adhanVoice:'../../private'},{volume:NaN},{volume:0},{timezone:'invalid/zone',systemTimezone:false},{prayer:true,city:'',country:''}]) assert.throws(()=>valid(patch))
  assert.equal(valid({quran:true,quranTime:'03:15'}).quranTime,'03:15')
})
test('daily reminders use their selected timezone and exclude past instants',()=>{
  const s=valid({quran:true,quranTime:'20:00',timezone:'Asia/Muscat',systemTimezone:false})
  assert.equal(C.next(s,'quran',Date.parse('2026-10-29T15:59:00Z')),Date.parse('2026-10-29T16:00:00Z'))
  assert.equal(C.next(s,'quran',Date.parse('2026-10-29T16:00:00Z')),Date.parse('2026-10-30T16:00:00Z'))
})
test('spring DST gap skips a nonexistent local time; fall overlap chooses the next real instant',()=>{
  const s=valid({quran:true,quranTime:'02:30',timezone:'America/New_York',systemTimezone:false})
  assert.equal(C.next(s,'quran',Date.parse('2026-03-08T06:00:00Z')),Date.parse('2026-03-09T06:30:00Z'))
  s.quranTime='01:30'
  assert.equal(C.next(s,'quran',Date.parse('2026-11-01T05:31:00Z')),Date.parse('2026-11-01T06:30:00Z'))
})
test('hadith respects the selected waking hours and library reminders are on Friday',()=>{
  const s=valid({hadith:true,hadithStart:8,hadithEnd:22,hadithHours:3,library:true,libraryTime:'19:00',timezone:'Asia/Muscat',systemTimezone:false})
  assert.equal(C.next(s,'hadith',Date.parse('2026-10-29T17:01:00Z')),Date.parse('2026-10-30T04:00:00Z'))
  assert.equal(C.next(s,'library',Date.parse('2026-10-29T15:01:00Z')),Date.parse('2026-10-30T15:00:00Z'))
})
test('prayer calendars preserve source offsets and select the next cached prayer only',()=>{
  const timings=Object.fromEntries(C.PRAYERS.map((p,i)=>[p,`2026-10-29T${String(5+i*3).padStart(2,'0')}:30:00+04:00`]))
  const calendar=C.parseCalendar({code:200,data:[{timings,meta:{timezone:'Asia/Muscat'},date:{gregorian:{date:'29-10-2026'}}}]})
  const s=valid({prayer:true,city:'Muscat',country:'Oman'})
  assert.equal(calendar[0].Fajr,Date.parse('2026-10-29T01:30:00Z'))
  assert.equal(C.next(s,'Fajr',Date.parse('2026-10-29T01:29:00Z'),calendar),Date.parse('2026-10-29T01:30:00Z'))
  assert.equal(C.next(s,'Fajr',Date.parse('2026-10-29T01:31:00Z'),calendar),Infinity)
  assert.throws(()=>C.parseCalendar({code:200,data:[{timings:{...timings,Fajr:'05:30 (GMT)'}}]}))
})
test('location or calculation changes invalidate a cached prayer identity',()=>{
  const s=valid({prayer:true,city:'Muscat',country:'Oman'})
  assert.notEqual(C.calendarIdentity(s),C.calendarIdentity({...s,city:'Cairo'}))
  assert.notEqual(C.calendarIdentity(s),C.calendarIdentity({...s,method:5}))
})
test('hadith notification opens exactly the displayed bundled text with its reference',()=>{
  const texts=require('../data/reminders.json').hadiths
  for(let i=0;i<texts.length;i++){const item=C.notification('hadith',valid({}),texts,i);assert.equal(item.body,texts[i].text+'\n'+texts[i].reference);assert.equal(item.route,'hadith:'+texts[i].id)}
})
test('all seven Quran readings have their original verified data and complete indexes',()=>{
  const catalog=require('../data/catalog.json');let total=0
  for(const entry of catalog.readings){const bytes=fs.readFileSync(path.join(root,'data/content',entry.id+'.json'));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);const data=JSON.parse(bytes);assert.equal(data.pages.length,604);assert.equal(data.surahs.length,114);assert.equal(data.juzStarts.length,30);assert(data.pages.every(p=>p.length>0));const count=data.pages.reduce((sum,p)=>sum+p.length,0);assert.equal(count,entry.verses);total+=count}
  assert.equal(total,43556)
})
test('twenty distinct muezzins and the extra Fajr recording are all included offline and match their fingerprints',()=>{
  assert.equal(voices.length,21);assert.equal(voices.filter(v=>!v.fajr).length,20);assert.equal(new Set(voices.map(v=>v.sha256)).size,21)
  for(const voice of voices){const bytes=fs.readFileSync(path.join(root,'data/adhan',voice.id+'.mp3'));assert.equal(bytes.length,voice.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),voice.sha256)}
})
