'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const routes = path.join(root, 'app/api/legacy-quran/route.ts')
const script = fs.readFileSync(path.join(root, 'public/legacy/ayah-highlight.js'), 'utf8')

class NextRequest {
  constructor(url) { this.url = String(url); this.nextUrl = new URL(String(url)) }
}
function loadRoute() {
  const modules = {}
  function evaluate(filename) {
    if (modules[filename]) return modules[filename]
    const source = filename === 'lib/legacy-reciters.ts'
      ? fs.readFileSync(path.join(root, 'lib/legacy-reciters.ts'), 'utf8')
      : fs.readFileSync(filename === 'route.ts' ? routes : filename, 'utf8')
    const compiled = ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText
    const mod = { exports: {} }
    vm.runInNewContext(compiled, {
      module: mod, exports: mod.exports, require(id) {
        if (id === 'next/server') return { NextRequest }
        if (id === '../quran/route') return { GET: async () => Response.json({ success: true, ayahs: [
          { text: 'آية أولى', numberInSurah: 6, surah: { number: 1, name: 'الفاتحة' } },
          { text: 'آية ثانية', numberInSurah: 7, surah: { number: 1, name: 'الفاتحة' } },
          { text: 'آية ثالثة', numberInSurah: 1, surah: { number: 2, name: 'البقرة' } },
        ] }) }
        if (id === '@/lib/legacy-reciters') return evaluate('lib/legacy-reciters.ts')
        throw new Error('Unexpected import: ' + id)
      }, Response, URL, AbortController, setTimeout, clearTimeout, fetch: async () => ({ ok: false }), Date, console,
    }, { filename })
    modules[filename] = mod.exports
    return mod.exports
  }
  return evaluate('route.ts')
}
class Element {
  constructor(attrs = {}) { this.attributes = attrs; this.className = attrs.className || ''; this.textContent = ''; this.events = {}; this.checked = true; this.scrolls = 0; this.currentTime = 0; this.duration = NaN; }
  getAttribute(key) { return Object.prototype.hasOwnProperty.call(this.attributes, key) ? String(this.attributes[key]) : null }
  addEventListener(event, handler) { (this.events[event] ||= []).push(handler) }
  dispatch(event, params = {}) { for (const handler of (this.events[event] || [])) handler(params) }
  getBoundingClientRect() { return { top: 300, bottom: 340 } }
  scrollIntoView() { this.scrolls++ }
}
function browserScenario({ timings = [], initial = 2, timingUrl = '/api/alafasy-timings/1' } = {}) {
  const v1 = new Element({ 'data-surah': 1, 'data-ayah': 1, className: 'ayah' })
  const v2 = new Element({ 'data-surah': 1, 'data-ayah': 2, className: 'ayah' })
  const status = new Element()
  const audio = new Element({ 'data-surah': 1, 'data-start-ayah': initial, 'data-timings-url': timingUrl })
  const follow = new Element()
  const elements = { 'legacy-quran-page': { getElementsByClassName: () => [v1, v2] }, 'legacy-quran-audio': audio, 'legacy-highlight-status': status, 'legacy-follow-ayah': follow, 'verse-1-1': v1, 'verse-1-2': v2 }
  class XMLHttpRequest {
    open(method, url) { this.url = url; this.method = method }
    send() { this.readyState = 4; this.status = 200; this.responseText = JSON.stringify(timings); this.onreadystatechange() }
  }
  const document = { getElementById: id => elements[id] || null, documentElement: { clientHeight: 900 } }
  const window = { innerHeight: 900, XMLHttpRequest, JSON }
  vm.runInNewContext(script, { document, window, XMLHttpRequest, JSON, Number, Date, isFinite, Math, Object, String })
  return { v1, v2, audio, follow, status }
}
async function main() {
  const route = loadRoute()
  const base = 'https://samee3.vercel.app/api/legacy-quran?page=2&riwaya=hafs'
  const result = await route.GET(new NextRequest(base))
  assert.equal(result.status, 200)
  const html = await result.text()
  assert.match(html, /id="verse-1-6"/)
  assert.match(html, /id="verse-2-1"/)
  assert.match(html, /data-timings-url="\/api\/alafasy-timings\/1"/)
  assert.match(html, /data-start-ayah="6"/)
  assert.match(html, /\/legacy\/ayah-highlight\.js/)
  assert.match(html, /\/api\/alafasy-audio\/001\.mp3/)
  assert.match(html, /<form action="\/api\/legacy-quran"/)
  const second = await route.GET(new NextRequest(base + '&surah=2'))
  assert.match(await second.text(), /data-timings-url="\/api\/alafasy-timings\/2"/)
  const beginning = await route.GET(new NextRequest(base + '&from=beginning'))
  assert.match(await beginning.text(), /data-start-ayah="1"/)
  const alternate = await route.GET(new NextRequest(base + '&reciter=husary'))
  const alternateHtml = await alternate.text()
  assert.match(alternateHtml, /data-timings-url=""/)
  assert.doesNotMatch(alternateHtml, /data-timings-url="\/api\/alafasy-timings/)
  const warsh = await route.GET(new NextRequest(base.replace('riwaya=hafs', 'riwaya=warsh')))
  assert.doesNotMatch(await warsh.text(), /id="legacy-quran-audio"/)
  assert.equal((await route.GET(new NextRequest(base.replace('page=2', 'page=999')))).status, 400)
  // Real timing is milliseconds; on initial load it seeks to the first page verse.
  const b = browserScenario({ timings: [
    { ayah: 1, start_time: 900, end_time: 2600 },
    { ayah: 2, start_time: 2400, end_time: 4900 },
  ] })
  b.audio.duration = 5
  b.audio.dispatch('loadedmetadata')
  assert.equal(b.audio.currentTime, 2.4)
  b.audio.currentTime = 1.2
  b.audio.dispatch('timeupdate')
  assert.match(b.v1.className, /is-current/)
  b.audio.currentTime = 2.5
  b.audio.dispatch('timeupdate')
  assert.doesNotMatch(b.v1.className, /is-current/)
  assert.match(b.v2.className, /is-current/)
  b.v1.dispatch('click')
  assert.equal(b.audio.currentTime, .9)
  assert.match(b.v1.className, /is-current/)
  b.audio.dispatch('ended')
  assert.doesNotMatch(b.v1.className, /is-current/)
  const noSync = browserScenario({ timingUrl: '' })
  noSync.v2.dispatch('click')
  assert.match(noSync.v2.className, /is-selected/)
  assert.doesNotMatch(noSync.v2.className, /is-current/)
  // Malformed timing is never painted automatically.
  const malformed = browserScenario({ timings: [{ ayah: 3, start_time: 0, end_time: 1000 }] })
  malformed.audio.currentTime = .5
  malformed.audio.dispatch('timeupdate')
  assert.doesNotMatch(malformed.v1.className, /is-current/)
  console.log('PASS: legacy Quran page and collected-Alafasy highlighting, switching surahs, ES5 behavior, timing validation')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
