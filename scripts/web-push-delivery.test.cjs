const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { createECDH } = require('node:crypto')
const { MessageChannel } = require('node:worker_threads')
const load = require('./load-ts.cjs')

test('the same push message supports native Safari display and an already-installed legacy worker', () => {
  const { webPushPayload } = load('lib/server/web-push-payload.ts')
  const payload = webPushPayload({ title: 'حان وقت الورد', body: 'تذكير القرآن', url: '/mushaf?page=4', tag: 'quran' })
  assert.equal(payload.web_push, 8030)
  assert.equal(payload.mutable, false)
  assert.equal(payload.notification.navigate, 'https://samee3.vercel.app/mushaf?page=4')
  assert.equal(payload.notification.title, payload.title)
  assert.equal(payload.notification.body, payload.body)
  assert.equal(payload.url, '/mushaf?page=4')
  assert.equal(payload.notification.silent, false)
})

test('notification navigation stays on the app origin, including credentials and protocol-relative links', () => {
  const { webPushPayload } = load('lib/server/web-push-payload.ts')
  for (const url of ['https://evil.test/phish', '//evil.test/phish', 'javascript:alert(1)', 'https://user:pass@samee3.vercel.app/a']) {
    assert.equal(webPushPayload({ title: 'تذكير', body: '', url, tag: 'x' }).notification.navigate, 'https://samee3.vercel.app/notifications')
  }
  const preview = webPushPayload({ title: 'تذكير', body: '', url: '/notifications', tag: 'x' }, 'https://preview.example.com')
  assert.equal(preview.notification.navigate, 'https://preview.example.com/notifications')
})

test('duplicated compatibility fields stay below the encrypted payload limit for Arabic, emoji and escaping', () => {
  const { webPushPayload } = load('lib/server/web-push-payload.ts')
  for (const text of ['ذكر'.repeat(1000), '😀'.repeat(1000), '\u0000'.repeat(1000)]) {
    const payload = webPushPayload({ title: text, body: text, url: '/mushaf?' + 'a'.repeat(580), tag: text })
    assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= 3600)
    assert.ok(payload.notification.title.length > 0)
    assert.equal(payload.notification.body, payload.body)
  }
})

function workerHarness() {
  const handlers = {}, shown = []
  const context = {
    URL, Request, Response, Headers, ReadableStream, Map, Uint8Array, console, setTimeout, clearTimeout,
    self: { location: { origin: 'https://samee3.test' }, addEventListener: (name, fn) => {
      const previous = handlers[name]
      handlers[name] = previous ? event => { previous(event); fn(event) } : fn
    },
      registration: { showNotification: async (...args) => shown.push(args) } },
  }
  vm.createContext(context)
  vm.runInContext(fs.readFileSync('public/sw.js', 'utf8'), context)
  const receive = async data => {
    let wait
    handlers.push({ data: { json: () => data }, waitUntil: p => { wait = p } })
    await wait
  }
  return { handlers, shown, receive }
}

test('older browsers display the declarative body and click target through the service worker', async () => {
  const { receive, shown } = workerHarness()
  await receive({ web_push: 8030, notification: { title: 'عنوان جديد', body: 'نص جديد', navigate: 'https://samee3.test/adhkar#morning', tag: 'morning' }, title: 'قديم' })
  assert.equal(shown.length, 1)
  assert.equal(shown[0][0], 'عنوان جديد')
  assert.equal(shown[0][1].body, 'نص جديد')
  assert.equal(shown[0][1].data.url, '/adhkar#morning')
})

test('malformed push JSON still produces a visible fallback rather than a silent push', async () => {
  const { receive, shown } = workerHarness()
  for (const data of [null, [], '', 42, { web_push: 8030, notification: { navigate: 'https://evil.test' } }]) await receive(data)
  assert.equal(shown.length, 5)
  for (const [title, options] of shown) {
    assert.equal(title, 'مصحف سميع')
    assert.equal(options.data.url, '/notifications')
  }
})

test('capability checks identify the active notification receiver without clearing caches or activating updates', () => {
  const { handlers } = workerHarness()
  let reply
  handlers.message({ data: { type: 'SAMEE3_PUSH_CAPABILITIES' }, ports: [{ postMessage: value => { reply = value } }] })
  assert.equal(reply.version, 1)
  assert.equal(reply.type, 'SAMEE3_PUSH_CAPABILITIES')
})

test('valid VAPID keys and saved schedules do not imply a working scheduler', () => {
  const { schedulerStatus } = load('lib/web-push-status.ts')
  const now = 2000000000000
  assert.equal(schedulerStatus(undefined, now).state, 'not-started')
  assert.equal(schedulerStatus({ lastRunAt: now }, now).state, 'not-started')
  assert.equal(schedulerStatus({ lastCompletedAt: now - 60000 }, now).state, 'running')
  assert.equal(schedulerStatus({ lastCompletedAt: now - 240000 }, now).state, 'stale')
  assert.equal(schedulerStatus({ lastCompletedAt: now + 86400000 }, now).state, 'not-started')
})

function clientHarness({ permission = 'granted', identity = null, subscription = null, receiver = true } = {}) {
  const values = new Map(), calls = [], shown = []
  if (identity) values.set('samee3_web_push_auth_v1', JSON.stringify(identity))
  const registration = {
    active: { postMessage(message, ports) { if (receiver) ports[0].postMessage({ type: message.type, version: 1 }) } },
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: async options => { calls.push(['subscribe', options]); return { toJSON: () => ({ endpoint: 'https://web.push.apple.com/fake' }) } },
    },
    showNotification: async (...args) => shown.push(args),
  }
  const client = load('lib/web-push-client.ts', {
    atob, AbortController, AbortSignal, Event, MessageChannel,
    localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    window: { isSecureContext: true, PushManager: {}, Notification: {}, matchMedia: () => ({ matches: true }), dispatchEvent() {} },
    navigator: { userAgent: 'iPhone', platform: 'iPhone', serviceWorker: { ready: Promise.resolve(registration), getRegistration: async () => registration } },
    Notification: { permission, requestPermission: () => { calls.push(['permission']); return Promise.resolve(permission) } },
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body); calls.push(['fetch', body])
      return { ok: true, json: async () => ({ id: 'a'.repeat(64), token: 'b'.repeat(43), next: [] }) }
    },
  })
  return { client, calls, shown, values, registration }
}

test('local display requests permission in the click and never calls the remote push API', async () => {
  const { client, calls, shown } = clientHarness()
  const pending = client.showLocalNotificationTest()
  assert.equal(calls[0][0], 'permission')
  await pending
  assert.equal(shown.length, 1)
  assert.equal(shown[0][0], 'اختبار العرض على هذا الجهاز')
  assert.equal(calls.some(call => call[0] === 'fetch'), false)
})

test('denied system permission does not claim successful local display', async () => {
  const { client, shown } = clientHarness({ permission: 'denied' })
  await assert.rejects(client.showLocalNotificationTest(), /اسمح/)
  assert.equal(shown.length, 0)
})

test('device checks distinguish saved identity, browser subscription and an answering active worker', async () => {
  const identity = { id: 'a'.repeat(64), token: 'b'.repeat(43) }
  const { client } = clientHarness({ identity })
  const status = await client.inspectWebPushDevice()
  assert.equal(status.permission, 'granted')
  assert.equal(status.savedSubscription, true)
  assert.equal(status.browserSubscription, false)
  assert.equal(status.receiverReady, true)
})

test('a non-answering old worker is reported rather than mistaken for the updated notification receiver', async () => {
  const { client } = clientHarness({ receiver: false })
  assert.equal((await client.inspectWebPushDevice()).receiverReady, false)
})

test('explicit subscription renewal replaces the browser endpoint without changing saved reminder settings', async () => {
  const key = createECDH('prime256v1'); key.generateKeys()
  const publicKey = key.getPublicKey().toString('base64url')
  const identity = { id: 'a'.repeat(64), token: 'b'.repeat(43), publicKey }
  const subscription = { options: { applicationServerKey: key.getPublicKey() }, unsubscribe: async () => true }
  const { client, calls, values } = clientHarness({ identity, subscription })
  const settings = load('lib/web-reminders.ts').DEFAULT_WEB_REMINDERS
  await client.enableWebPush(settings, publicKey, true)
  assert.equal(calls[0][0], 'permission')
  assert.equal(calls.filter(call => call[0] === 'subscribe').length, 1)
  assert.ok(calls.some(call => call[1]?.action === 'unsubscribe'))
  assert.deepEqual(calls.find(call => call[1]?.action === 'subscribe')[1].settings, JSON.parse(JSON.stringify(settings)))
  assert.equal(JSON.parse(values.get('samee3_web_push_auth_v1')).publicKey, publicKey)
})

test('matching VAPID keys preserve an existing valid subscription on ordinary saves', async () => {
  const key = createECDH('prime256v1'); key.generateKeys()
  const publicKey = key.getPublicKey().toString('base64url')
  let unsubscribed = false
  const subscription = { options: { applicationServerKey: key.getPublicKey() }, unsubscribe: async () => { unsubscribed = true; return true }, toJSON: () => ({ endpoint: 'https://web.push.apple.com/fake' }) }
  const { client, calls } = clientHarness({ identity: { id: 'a'.repeat(64), token: 'b'.repeat(43), publicKey }, subscription })
  await client.enableWebPush(load('lib/web-reminders.ts').DEFAULT_WEB_REMINDERS, publicKey)
  assert.equal(unsubscribed, false)
  assert.equal(calls.filter(call => call[0] === 'subscribe').length, 0)
})

test('the HTTP test reports provider acceptance without asserting device delivery or exposing subscription credentials', async () => {
  const http = load('lib/server/http.ts')
  const { NextRequest } = require('next/server')
  let sent = 0
  const reference = { firestore: { runTransaction: async callback => callback({ get: async () => ({ data: () => ({ lastTestAt: 0 }) }), update() {} }) } }
  const server = {
    pushConfigured: () => true,
    authorizedSubscription: async () => ({ reference, data: { subscription: { endpoint: 'PRIVATE_ENDPOINT' } } }),
    sendWebNotification: async () => { sent++; return { statusCode: 201 } },
    webPushSchedulerStatus: async () => ({ state: 'not-started', lastCompletedAt: null }),
  }
  const route = load('app/api/web-push/route.ts', { require: name => {
    if (name === '@/lib/server/web-push') return server
    if (name === '@/lib/server/http') return http
    if (name === '@/lib/web-reminders') return load('lib/web-reminders.ts')
    return require(name)
  } })
  const response = await route.POST(new NextRequest('https://samee3.test/api/web-push', {
    method: 'POST', headers: { Origin: 'https://samee3.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'test', id: 'a'.repeat(64), token: 'b'.repeat(43) }),
  }))
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(sent, 1)
  assert.equal(result.accepted, true)
  assert.equal(result.providerStatus, 201)
  assert.equal(result.scheduler.state, 'not-started')
  assert.equal('delivered' in result, false)
  assert.equal(JSON.stringify(result).includes('PRIVATE_ENDPOINT'), false)
  assert.equal(JSON.stringify(result).includes('b'.repeat(43)), false)
})
