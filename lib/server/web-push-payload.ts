type PushMessage = { title: string; body: string; url: string; tag: string }

/** Native declarative display on newer Safari, with fields for existing workers. */
export function webPushPayload(event: PushMessage, configuredOrigin?: string) {
  let origin = 'https://samee3.vercel.app'
  try {
    const value = new URL(configuredOrigin || origin)
    if (value.protocol === 'https:' && !value.username && !value.password && value.origin.length <= 300) origin = value.origin
  } catch { /* Use the canonical site rather than an invalid navigation URL. */ }
  let target = new URL('/notifications', origin)
  try {
    const value = new URL(event.url, origin)
    if (value.origin === origin && !value.username && !value.password) target = value
  } catch { /* Keep the safe default. */ }
  let title = Array.from(event.title || 'مصحف سميع').slice(0, 150).join('')
  let body = Array.from(event.body || '').slice(0, 700).join('')
  let tag = Array.from(event.tag).slice(0, 100).join('')
  // Bound URLs as well as text so the encrypted push fits the provider's limit.
  if (target.href.length > 600) target = new URL('/notifications', origin)
  const make = () => ({
    web_push: 8030,
    // Immutable display does not need to start service-worker JavaScript.
    mutable: false,
    notification: {
      title, body, tag, dir: 'rtl' as const, lang: 'ar', silent: false,
      navigate: target.href, icon: new URL('/icon-192.png', origin).href,
      data: { url: target.pathname + target.search + target.hash },
    },
    // Older already-installed workers still understand this same message.
    title, body, tag, url: target.pathname + target.search + target.hash,
  })
  let payload = make()
  while (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 3600 && body.length) {
    body = Array.from(body).slice(0, Math.floor(Array.from(body).length / 2)).join('')
    payload = make()
  }
  while (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 3600 && Array.from(title).length > 1) {
    title = Array.from(title).slice(0, Math.ceil(Array.from(title).length / 2)).join('')
    payload = make()
  }
  while (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 3600 && tag.length) {
    tag = Array.from(tag).slice(0, Math.floor(Array.from(tag).length / 2)).join('')
    payload = make()
  }
  return payload
}
