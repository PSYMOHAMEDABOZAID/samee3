/* Standalone offline regression tests for the drop-in SAMEE3 proxy route. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'app/api/audio-proxy/route.ts'), 'utf8')
const { outputText, diagnostics } = ts.transpileModule(source, {
  fileName: 'route.ts',
  reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
assert.equal((diagnostics || []).length, 0)

class NextResponse extends Response {
  static json(payload, init) {
    return new NextResponse(JSON.stringify(payload), {
      ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    })
  }
}
const calls = []
let upstreamResponse = () => new Response('audio', { status: 200, headers: {
  'Content-Type': 'audio/mpeg', 'Content-Length': '5',
} })
const mod = { exports: {} }
const sandbox = {
  module: mod, exports: mod.exports, Response, Headers, URL, AbortController, DOMException,
  Set, Error, Number, RegExp, JSON, String, Object, Array, console, setTimeout, clearTimeout,
  fetch: async (url, init) => { calls.push({ url, init }); return upstreamResponse(url, init) },
  require(name) {
    if (name === 'next/server') return { NextResponse }
    if (name === '@/lib/audio-catalog') return { LIBRARY_MEDIA_HOSTS: new Set(['quran.tv', 'audio.islamweb.net']) }
    throw new Error('Unexpected import: ' + name)
  },
}
vm.runInNewContext(outputText, sandbox, { filename: 'route.js' })
const { GET, HEAD } = mod.exports
const controller = new AbortController()
function req(url = 'https://quran.tv/tracks/001.mp3', headers = {}, method = 'GET') {
  return { method, headers: new Headers(headers), signal: controller.signal,
    nextUrl: new URL('https://samee3.vercel.app/api/audio-proxy?url=' + encodeURIComponent(url)) }
}
let done = 0
const check = async (title, action) => { await action(); done++; console.log('PASS', title) }
;(async () => {
  await check('Public complete small audio has CDN cache header', async () => {
    const r = await GET(req()); assert.equal(r.status, 200)
    assert.match(r.headers.get('Cache-Control'), /s-maxage=21600/)
    assert.equal(await r.text(), 'audio')
    assert.equal(calls.at(-1).init.credentials, 'omit')
  })
  await check('Range requests remain private, preserve 206 and Content-Range', async () => {
    upstreamResponse = () => new Response('ud', { status: 206, headers: {
      'Content-Type': 'audio/mpeg', 'Content-Length': '2', 'Content-Range': 'bytes 2-3/5',
    } })
    const r = await GET(req(undefined, { Range: 'bytes=2-3' }))
    assert.equal(r.status, 206)
    assert.equal(r.headers.get('Content-Range'), 'bytes 2-3/5')
    assert.equal(r.headers.get('Cache-Control'), 'private, no-store')
    assert.equal(calls.at(-1).init.headers.get('Range'), 'bytes=2-3')
  })
  upstreamResponse = () => new Response('audio', { status: 200, headers: {
    'Content-Type': 'audio/mpeg', 'Content-Length': '5',
  } })
  await check('HEAD is never cached as an empty GET body', async () => {
    const r = await HEAD(req(undefined, {}, 'HEAD'))
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('Cache-Control'), 'private, no-store')
    assert.equal(r.body, null)
  })
  await check('No cache for upstream private audio', async () => {
    upstreamResponse = () => new Response('audio', { headers: {
      'Content-Type': 'audio/mpeg', 'Content-Length': '5', 'Cache-Control': 'private, no-store',
    } })
    assert.equal((await GET(req())).headers.get('Cache-Control'), 'private, no-store')
  })
  await check('No cache for 10 MB+ audio', async () => {
    upstreamResponse = () => new Response('audio', { headers: {
      'Content-Type': 'audio/mpeg', 'Content-Length': '10500000',
    } })
    assert.equal((await GET(req())).headers.get('Cache-Control'), 'private, no-store')
  })
  await check('No cache for authenticated client request', async () => {
    upstreamResponse = () => new Response('audio', { headers: {
      'Content-Type': 'audio/mpeg', 'Content-Length': '5',
    } })
    assert.equal((await GET(req(undefined, { Authorization: 'Bearer private' }))).headers.get('Cache-Control'), 'private, no-store')
  })
  await check('Invalid host rejected before network request', async () => {
    const n = calls.length
    const r = await GET(req('https://attacker.example/001.mp3'))
    assert.equal(r.status, 400); assert.equal(calls.length, n)
  })
  await check('Disallowed redirect rejected before fetching its target', async () => {
    upstreamResponse = () => new Response(null, { status: 302, headers: {
      Location: 'https://attacker.example/001.mp3',
    } })
    const n = calls.length
    assert.equal((await GET(req())).status, 502)
    assert.equal(calls.length, n + 1)
  })
  await check('Malformed redirect returns a controlled error', async () => {
    upstreamResponse = () => new Response(null, { status: 302, headers: { Location: 'http://[' } })
    assert.equal((await GET(req())).status, 502)
  })
  await check('Wrong upstream MIME not forwarded as audio', async () => {
    upstreamResponse = () => new Response('<html>blocked</html>', { headers: {
      'Content-Type': 'text/html', 'Content-Length': '20',
    } })
    assert.equal((await GET(req())).status, 502)
  })
  assert.doesNotMatch(source, /api\/alafasy-audio|ALAFASY_COLLECTED_RELEASE/)
  console.log(`ALL ${done} TESTS PASSED`)
})().catch(e => { console.error(e); process.exitCode = 1 })
