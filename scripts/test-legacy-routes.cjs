'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
let ts
try { ts = require('typescript') } catch {
  console.log('Skip TypeScript route tests: install project dependencies first.')
  process.exit(0)
}
const root = path.resolve(__dirname, '..')
class NextRequest {
  constructor(url) { this.url = String(url); this.nextUrl = new URL(String(url)) }
}
const NextResponse = { redirect(url, options) { return { location: String(url), status: options.status } } }
const config = {
  releaseTag: 'samee3-apps',
  windows: [{ id: 'x64', assetName: 'Samee3-Windows-1.0.0-x64-Setup.exe' }],
  macos: [
    { id: 'apple-silicon', assetName: 'Samee3-Mac-1.0.0-Apple-Silicon.zip' },
    { id: 'intel', assetName: 'Samee3-Mac-1.0.0-Intel.zip' },
  ],
}
function load(file, mocks) {
  const code = fs.readFileSync(path.join(root, file), 'utf8')
  const compiled = ts.transpileModule(code, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, {
    module, exports: module.exports, require(id) {
      if (id === 'next/server') return { NextRequest, NextResponse }
      if (id === '@/public/android/release.json') return { available: true, apkPath: '/android/Samee3-1.1.0.apk' }
      if (id === '@/public/app-downloads.json') return config
      if (id === '../quran/route') return { GET: async () => Response.json({ success: true, ayahs: [{ text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', numberInSurah: 1, surah: { name: 'الفاتحة', number: 1 } }] }) }
      throw new Error('Unexpected dependency: ' + id)
    },
    Response, URL, AbortController, setTimeout, clearTimeout,
    fetch: mocks.fetch,
    console,
  }, { filename: file })
  return module.exports
}
async function test() {
  const quran = load('app/api/legacy-quran/route.ts', {})
  const success = await quran.GET(new NextRequest('https://samee3.vercel.app/api/legacy-quran?page=1&riwaya=hafs'))
  assert.equal(success.status, 200)
  const body = await success.text()
  assert.ok(body.includes('بِسْمِ اللَّهِ'))
  assert.ok(body.includes('الصفحة التالية'))
  assert.ok(body.includes('cdn.mp3quran.net'))
  const invalid = await quran.GET(new NextRequest('https://samee3.vercel.app/api/legacy-quran?page=999'))
  assert.equal(invalid.status, 400)
  const releaseUrl = 'https://github.com/PSYMOHAMEDABOZAID/samee3/releases/download/samee3-tv/SAMEE3-TV.apk'
  const downloads = load('app/api/legacy-download/route.ts', { fetch: async () => ({ ok: true, async json() { return { assets: [{ name: 'SAMEE3-TV.apk', state: 'uploaded', size: 5_000_000, browser_download_url: releaseUrl }] } } }) })
  const tv = await downloads.GET(new NextRequest('https://samee3.vercel.app/api/legacy-download?kind=tv'))
  assert.equal(tv.status, 302)
  assert.equal(tv.location, releaseUrl)
  const android = await downloads.GET(new NextRequest('https://samee3.vercel.app/api/legacy-download?kind=android'))
  assert.equal(android.location, 'https://samee3.vercel.app/android/Samee3-1.1.0.apk')
  const failDownloads = load('app/api/legacy-download/route.ts', { fetch: async () => ({ ok: false }) })
  const notFound = await failDownloads.GET(new NextRequest('https://samee3.vercel.app/api/legacy-download?kind=tv'))
  assert.equal(notFound.status, 503)
  assert.ok((await notFound.text()).includes('GitHub'))
  const audio = load('app/api/legacy-audio/route.ts', {})
  const audioResp = await audio.GET(new NextRequest('https://samee3.vercel.app/api/legacy-audio?surah=114'))
  const audioHtml = await audioResp.text()
  assert.equal(audioResp.status, 200)
  assert.ok(audioHtml.includes('114.mp3'))
  assert.ok(audioHtml.includes('مصدر MP3 بديل'))
  console.log('SAMEE3 Legacy Compatibility: mocked route tests passed.')
}
test().catch((error) => { console.error(error); process.exitCode = 1 })
