import { createHash, randomBytes } from 'node:crypto'
import webPush, { type PushSubscription } from 'web-push'
import { serverDb, adminConfigured } from './firebase-admin'
import { equalSecret } from './http'
import { locationDate, shiftPrayerDate, type PrayerDay } from '@/lib/prayer-times'
import { reminderEvents, type ReminderEvent, type WebReminderSettings } from '@/lib/web-reminders'
import { prayerSource } from './prayer-source'
import { validatePushConfiguration } from './push-config'

const subscriptions = 'webPushSubscriptions'
export const pushConfiguration = () => {
  const keys = validatePushConfiguration(process.env)
  return !keys.ok ? keys : adminConfigured() ? keys : { ok: false, code: 'MISSING_SERVER_CREDENTIALS' } as const
}
export const pushConfigured = () => pushConfiguration().ok
export const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export function validSubscription(raw: unknown): PushSubscription {
  if (!raw || typeof raw !== 'object') throw new Error('اشتراك الإشعارات غير صالح.')
  const value = raw as { endpoint?: unknown; keys?: { auth?: unknown; p256dh?: unknown } }
  if (typeof value.endpoint !== 'string' || value.endpoint.length > 2048) throw new Error('عنوان الإشعارات غير صالح.')
  const url = new URL(value.endpoint)
  const allowed = url.hostname === 'fcm.googleapis.com' || /(?:^|\.)push\.apple\.com$/.test(url.hostname) || /(?:^|\.)push\.services\.mozilla\.com$/.test(url.hostname) || /(?:^|\.)notify\.windows\.com$/.test(url.hostname)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowed || url.hash) throw new Error('خدمة الإشعارات على هذا المتصفح غير مدعومة حاليًا.')
  const { auth, p256dh } = value.keys || {}
  if (typeof auth !== 'string' || typeof p256dh !== 'string' || !/^[\w-]{22,24}$/.test(auth) || !/^[\w-]{86,90}$/.test(p256dh) || Buffer.from(auth, 'base64url').length !== 16 || Buffer.from(p256dh, 'base64url').length !== 65) throw new Error('مفاتيح الاشتراك غير صالحة.')
  return { endpoint: url.href, keys: { auth, p256dh } }
}
export async function plannedEvents(settings: WebReminderSettings, after = Date.now()) {
  const days: PrayerDay[] = []
  if (settings.prayer && settings.latitude !== null && settings.longitude !== null) {
    const today = locationDate(new Date(after), settings.timezone)
    for (let offset = 0; offset < 3; offset++) {
      const date = shiftPrayerDate(today, offset)
      const key = digest(JSON.stringify([date, settings.latitude, settings.longitude, settings.method, settings.school, settings.timezone]))
      const cache = serverDb().doc(`prayerNotificationCache/${key}`)
      const saved = await cache.get()
      const cachedDay = saved.data()?.day as PrayerDay | undefined
      if (cachedDay?.date === date && cachedDay.timezone === settings.timezone) days.push(cachedDay)
      else {
        const { day } = await prayerSource(date, { latitude: settings.latitude, longitude: settings.longitude, method: settings.method, school: settings.school, timezone: settings.timezone })
        days.push(day)
        await cache.set({ day, expiresAt: new Date(after + 7 * 86400000) })
      }
    }
  }
  return reminderEvents(settings, after, days)
}
export async function registerWebPush(subscription: PushSubscription, settings: WebReminderSettings, token?: string) {
  const id = digest(subscription.endpoint), reference = serverDb().doc(`${subscriptions}/${id}`)
  const events = await plannedEvents(settings)
  const nextToken = token || randomBytes(32).toString('base64url')
  await serverDb().runTransaction(async tx => {
    const previous = await tx.get(reference)
    if (previous.exists && !equalSecret(digest(nextToken), previous.data()?.tokenHash)) throw new Error('أعد إيقاف الاشتراك في المتصفح ثم فعّله مجددًا لاستعادته.')
    tx.set(reference, {
      subscription, settings, tokenHash: digest(nextToken), events,
      nextAt: events[0]?.at ?? Number.MAX_SAFE_INTEGER,
      updatedAt: Date.now(), createdAt: previous.data()?.createdAt || Date.now(),
      leaseUntil: 0, lastError: '',
    }, { merge: true })
  })
  return { id, token: nextToken, next: events.slice(0, 8) }
}
export async function authorizedSubscription(id: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(id) || !/^[\w-]{40,60}$/.test(token)) throw new Error('UNAUTHORIZED')
  const reference = serverDb().doc(`${subscriptions}/${id}`), snapshot = await reference.get()
  if (!snapshot.exists || !equalSecret(digest(token), snapshot.data()?.tokenHash)) throw new Error('UNAUTHORIZED')
  return { reference, data: snapshot.data()! }
}
export async function sendWebNotification(subscription: PushSubscription, event: Omit<ReminderEvent, 'at' | 'kind'> & { tag: string }) {
  if (!pushConfigured()) throw new Error('إعداد الإشعارات على الخادم غير مكتمل.')
  return webPush.sendNotification(subscription, JSON.stringify(event), {
    vapidDetails: { subject: process.env.WEB_PUSH_SUBJECT!, publicKey: process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY!, privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY! },
    TTL: 120, urgency: 'high', timeout: 10000,
  })
}
export async function dispatchWebReminders() {
  const db = serverDb(), now = Date.now()
  const heartbeat = db.doc('appMetrics/pushScheduler')
  await heartbeat.set({ lastRunAt: now }, { merge: true })
  const due = await db.collection(subscriptions).where('nextAt', '<=', now).limit(80).get()
  let sent = 0, removed = 0, failed = 0, claimed = 0
  const process = async (snapshot: typeof due.docs[number]) => {
    const reference = snapshot.ref
    const data = await db.runTransaction(async tx => {
      const fresh = await tx.get(reference), row = fresh.data()
      if (!row || row.leaseUntil > now || row.nextAt > now) return null
      tx.update(reference, { leaseUntil: now + 90000 })
      return row
    })
    if (!data) return
    claimed++
    const events = data.events as ReminderEvent[], settings = data.settings as WebReminderSettings
    let remaining = events.filter(e => e.at > now), lastError = '', retry = false
    try {
      // Never deliver a backlog of old adhans after the scheduler or phone was offline.
      for (const event of events.filter(e => e.at <= now && e.at >= now - 120000).slice(0, 6)) {
        await sendWebNotification(data.subscription as PushSubscription, { title: event.title, body: event.body, url: event.url, tag: `samee3-${event.kind}-${event.at}` })
        sent++
      }
      if (!remaining.length || remaining[remaining.length - 1].at < now + 86400000) remaining = await plannedEvents(settings, now)
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) { await reference.delete(); removed++; return }
      failed++; retry = true; lastError = 'تعذر إرسال أو تجديد بعض التذكيرات. ستتم المحاولة تلقائيًا.'
      // Keep unsent events briefly for transient failures; stable notification tags collapse retries.
      remaining = events.filter(e => e.at > now - 120000)
    }
    await reference.update({ events: remaining, nextAt: retry ? Math.min(remaining.find(e => e.at > now)?.at ?? Number.MAX_SAFE_INTEGER, now + 60000) : remaining[0]?.at ?? Number.MAX_SAFE_INTEGER, leaseUntil: 0, lastProcessedAt: now, lastError })
  }
  // Limit concurrent push connections and leave room for Vercel's function deadline.
  for (let i = 0; i < due.docs.length && Date.now() - now < 40000; i += 4) {
    const results = await Promise.allSettled(due.docs.slice(i, i + 4).map(process))
    failed += results.filter(result => result.status === 'rejected').length
  }
  await heartbeat.set({ lastRunAt: now, lastCompletedAt: Date.now(), sent, removed, failed, claimed, pendingBatch: due.size }, { merge: true })
  return { sent, removed, failed, claimed }
}
