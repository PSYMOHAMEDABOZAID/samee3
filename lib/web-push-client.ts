'use client'

import { timeoutSignal } from '@/lib/abort-signals'
import { validPushPublicKey } from './push-key'

import { DEFAULT_WEB_REMINDERS, parseWebSettings, WEB_SETTINGS_KEY, type WebReminderSettings } from './web-reminders'
const AUTH_KEY = 'samee3_web_push_auth_v1'
export function installedWebApp() { return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true }
export function iosDevice() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) }
export function pushSupport() { return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window }
export function readWebSettings(): WebReminderSettings {
  try { const data = localStorage.getItem(WEB_SETTINGS_KEY); if (data) return parseWebSettings(JSON.parse(data)) } catch {}
  return { ...DEFAULT_WEB_REMINDERS, prayers: [...DEFAULT_WEB_REMINDERS.prayers], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Muscat' }
}
export function storeWebSettings(settings: WebReminderSettings) {
  localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(settings))
  window.dispatchEvent(new Event('samee3:prayer-settings'))
}
export function pushIdentity(): { id: string; token: string } | null {
  try {
    const value = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')
    return value && typeof value.id === 'string' && /^[a-f0-9]{64}$/.test(value.id) &&
      typeof value.token === 'string' && /^[\w-]{40,60}$/.test(value.token) ? value : null
  } catch { return null }
}
export type WebPushConfig = { configured: boolean; publicKey?: string; code?: string; error?: string }
export async function fetchWebPushConfig(signal?: AbortSignal): Promise<WebPushConfig> {
  const controller = new AbortController(), cancel = () => controller.abort()
  const timer = setTimeout(cancel, 12000)
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    if (signal?.aborted) controller.abort()
    const response = await fetch('/api/web-push', { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error('تعذر فحص خدمة الإشعارات. أعد المحاولة.')
    const data = await response.json()
    if (!data.configured || !validPushPublicKey(data.publicKey)) return { configured: false, code: data.code || 'INVALID_VAPID_PUBLIC_KEY',
      error: data.error || 'مفتاح الإشعارات العام على الخادم غير صالح. يلزم تصحيح إعداد الخادم ثم إعادة النشر.' }
    return { configured: true, publicKey: data.publicKey }
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
}
export async function pushCommand(action: 'test' | 'unsubscribe' | 'status') {
  const identity = pushIdentity()
  if (!identity) throw new Error('فعّل اشتراك الإشعارات أولًا.')
  const response = await fetch('/api/web-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...identity }), signal: timeoutSignal(20000) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'تعذر الاتصال بخدمة الإشعارات.')
  return result
}
function keyBytes(value: string) {
  const bytes = atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='))
  const result = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) result[i] = bytes.charCodeAt(i)
  return result
}
export async function enableWebPush(settings: WebReminderSettings, publicKey: string) {
  if (!pushSupport()) throw new Error(iosDevice() ? 'ثبّت سميع من «إضافة إلى الشاشة الرئيسية» ثم افتحه من الأيقونة على iOS 16.4 أو أحدث.' : 'إشعارات الويب غير متاحة على هذا الجهاز. استخدم متصفحًا حديثًا أو نسخة أندرويد.')
  if (!validPushPublicKey(publicKey)) throw new Error('مفتاح الإشعارات العام غير صالح. يلزم تصحيح إعداد الخادم أولًا.')
  const validated = parseWebSettings(settings)
  // Must be the first asynchronous browser call in the actual button click on iOS.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('اسمح بإشعارات سميع من إعدادات النظام ثم جرّب مجددًا.')
  const registration = await new Promise<ServiceWorkerRegistration>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('أعد فتح التطبيق لتجهيز خدمة الإشعارات.')), 15000)
    navigator.serviceWorker.ready.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) })
  })
  let subscription = await registration.pushManager.getSubscription()
  const identity = pushIdentity()
  const requestedKey = keyBytes(publicKey)
  const existingKey = subscription?.options.applicationServerKey
  const changedKey = existingKey && (existingKey.byteLength !== requestedKey.length || new Uint8Array(existingKey).some((value, index) => value !== requestedKey[index]))
  if (subscription && (!identity || changedKey)) {
    if (identity) await pushCommand('unsubscribe').catch(() => undefined)
    await subscription.unsubscribe(); subscription = null
  }
  subscription = subscription || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) })
  const response = await fetch('/api/web-push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'subscribe', subscription: subscription.toJSON(), settings: validated, token: identity?.token }), signal: timeoutSignal(55000) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'تعذر تسجيل الاشتراك على الخادم.')
  localStorage.setItem(AUTH_KEY, JSON.stringify({ id: data.id, token: data.token }))
  storeWebSettings(validated)
  window.dispatchEvent(new Event('samee3:push-changed'))
  return data
}
export async function disableWebPush() {
  // Revoke the server schedule before removing the browser subscription, so disabling is reliable.
  if (pushIdentity()) await pushCommand('unsubscribe')
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) await subscription.unsubscribe()
  localStorage.removeItem(AUTH_KEY)
  window.dispatchEvent(new Event('samee3:push-changed'))
}
