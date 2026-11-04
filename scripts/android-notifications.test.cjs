const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const load = require('./load-ts.cjs')
const { parseAndroidRelease } = load('lib/android-release.ts')

test('download card accepts only complete same-site APK releases', () => {
  const valid = { available: true, versionCode: 2, versionName: '1.1.0', minSdk: 26, apkPath: '/android/Samee3-1.1.0.apk', sha256: 'a'.repeat(64), bytes: 3700000, notes: [] }
  assert.equal(parseAndroidRelease(valid).versionCode, 2)
  for (const replacement of [{ available: false }, { apkPath: '//evil.example/app.apk' }, { apkPath: '/android/../other.apk' }, { sha256: '' }, { bytes: 0 }, { versionCode: 1.2 }, { apkPath: 'javascript:alert(1)' }]) assert.equal(parseAndroidRelease({ ...valid, ...replacement }), null)
})

function bridge({ child = false } = {}) {
  const listeners = new Map(), sent = []
  const window = { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: (key, fn) => { if (listeners.get(key) === fn) listeners.delete(key) }, dispatchEvent: () => {} }
  window.top = child ? {} : window
  const port = { start() {}, close() {}, postMessage: (value) => sent.push(JSON.parse(value)) }
  const context = { window, Event, Promise, Error, setTimeout, clearTimeout, Date, Object, JSON }
  vm.createContext(context)
  const setup = vm.runInContext('(' + fs.readFileSync('native/android/app/src/main/assets/android-bridge.js', 'utf8') + ')', context)
  setup('test-secret-token')
  return { window, port, sent, connect: (token) => listeners.get('message')?.({ data: token, ports: [port] }) }
}

test('native bridge is unavailable to child frames and rejects the wrong handshake token', () => {
  const child = bridge({ child: true }); child.connect('test-secret-token'); assert.equal(child.window.Samee3Android, undefined)
  const main = bridge(); main.connect('other-token'); assert.equal(main.window.Samee3Android, undefined)
  main.connect('test-secret-token'); assert.equal(typeof main.window.Samee3Android.request, 'function'); main.window.__samee3AndroidCleanup()
})

test('native replies correlate requests and navigation rejects unfinished operations', async () => {
  const value = bridge(); value.connect('test-secret-token')
  const operation = value.window.Samee3Android.request('status')
  value.port.onmessage({ data: JSON.stringify({ id: value.sent[0].id, ok: true, data: { platform: 'android' } }) })
  assert.equal((await operation).platform, 'android')
  const pending = value.window.Samee3Android.request('permission'); value.window.__samee3AndroidCleanup()
  await assert.rejects(pending)
  assert.equal(value.window.Samee3Android, undefined)
})

function worker(fetch) {
  const events = {}, context = { URL, Request, Response, Headers, Blob, console, setTimeout, clearTimeout, fetch,
    self: { location: { origin: 'https://samee3.test' }, addEventListener: (key, fn) => events[key] = fn, clients: { claim: async () => {} } },
    caches: { open: async () => ({ match: async () => new Response('old-icon'), put: async () => {} }) } }
  vm.createContext(context); vm.runInContext(fs.readFileSync('public/sw.js', 'utf8'), context)
  return { context, events }
}

test('icons change immediately online while immutable chunks can remain cached', async () => {
  let requests = 0
  const { context } = worker(async () => { requests++; return new Response('new-icon') })
  assert.equal(await (await context.staticAsset(new Request('https://samee3.test/icon-192.png'))).text(), 'new-icon')
  assert.equal(requests, 1)
  assert.equal(await (await context.staticAsset(new Request('https://samee3.test/_next/static/chunks/hash.js'))).text(), 'old-icon')
  assert.equal(requests, 1)
})

test('release checks and APKs bypass caches; notification texts never share a cached detail key', () => {
  const { context, events } = worker(async () => { throw Error('network') })
  for (const path of ['/android/release.json', '/android/Samee3-1.1.0.apk', '/api/app-version']) {
    let intercepted = false
    events.fetch({ request: new Request('https://samee3.test' + path), respondWith() { intercepted = true } })
    assert.equal(intercepted, false)
  }
  assert.notEqual(context.samePathKey(new URL('https://samee3.test/notifications/hadith?id=bukhari-13')), context.samePathKey(new URL('https://samee3.test/notifications/hadith?id=bukhari-10')))
})

test('prayer display and countdown preserve the source UTC offset through offline snapshots', () => {
  const { parsePrayerDay, nextPrayerFromDays } = load('lib/prayer-times.ts')
  const timings = { Fajr: '2026-04-30T04:30:00+03:00', Sunrise: '2026-04-30T05:45:00+03:00', Dhuhr: '2026-04-30T12:00:00+03:00', Asr: '2026-04-30T15:20:00+03:00', Maghrib: '2026-04-30T18:00:00+03:00', Isha: '2026-04-30T19:30:00+03:00' }
  const day = parsePrayerDay({ code: 200, data: { timings, meta: { timezone: 'Africa/Cairo' }, date: { gregorian: { date: '30-04-2026' } } } })
  assert.equal(day.timings.Fajr, '04:30')
  assert.equal(nextPrayerFromDays([day], new Date('2026-04-30T01:29:00Z')).at, Date.parse('2026-04-30T01:30:00Z'))
  const saved = JSON.parse(JSON.stringify(day))
  const restored = parsePrayerDay({ code: 200, data: { timings: saved.isoTimings || saved.timings, meta: { timezone: saved.timezone }, date: { gregorian: { date: saved.gregorian } } } })
  assert.equal(restored.instants.Fajr, day.instants.Fajr)
  assert.throws(() => parsePrayerDay({ code: 200, data: { timings: { ...timings, Fajr: '2026-05-01T04:30:00+03:00' }, meta: { timezone: 'Africa/Cairo' }, date: { gregorian: { date: '30-04-2026' } } } }))
})

test('website build identity remains the same in compiler workers and at production startup', async () => {
  const source = fs.readFileSync('next.config.js', 'utf8')
  function config(env, stored) {
    const module = { exports: {} }
    const context = { module, __dirname: '/project', process: { env }, require(name) {
      if (name === 'node:fs') return { writeFileSync() {}, readFileSync() { if (!stored) throw Error('No stored build'); return stored } }
      return require(name)
    } }
    vm.createContext(context); vm.runInContext(source, context)
    return module.exports
  }
  const env = {}, first = config(env)('phase-production-build')
  const buildId = await first.generateBuildId()
  assert.equal(first.env.NEXT_PUBLIC_SAMEE3_BUILD_ID, buildId)
  assert.equal(config({ ...env })('phase-production-build').env.NEXT_PUBLIC_SAMEE3_BUILD_ID, buildId)
  assert.equal(config({}, buildId)('phase-production-server').env.NEXT_PUBLIC_SAMEE3_BUILD_ID, buildId)
  assert.notEqual(config({})('phase-production-build').env.NEXT_PUBLIC_SAMEE3_BUILD_ID, buildId)
})
