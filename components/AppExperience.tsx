'use client'

import { timeoutSignal } from '@/lib/abort-signals'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { BellRing, Maximize, X } from 'lucide-react'
import { useAndroidApp, nativeRequest } from '@/lib/android-native'
import { enableWebPush, fetchWebPushConfig, installedWebApp, iosDevice, pushIdentity, pushSupport, readWebSettings } from '@/lib/web-push-client'
import { reminderEvents } from '@/lib/web-reminders'
const ID_KEY = 'samee3_install_id_v1', PROMPT_KEY = 'samee3_notification_onboarding_v1'
function installId() {
  let id = localStorage.getItem(ID_KEY)
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(ID_KEY, id) }
  return id
}
export default function AppExperience() {
  const pathname = usePathname(), { status: android } = useAndroidApp()
  const [prompt, setPrompt] = useState(false), [tv, setTv] = useState(false), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [config, setConfig] = useState<{ configured: boolean; publicKey?: string } | null>(null)
  const [reminder, setReminder] = useState<{ title: string; url: string } | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    let television = /SAMEE3TV|SMART-TV|SmartTV|Tizen|webOS|Web0S|NetCast|HbbTV/i.test(navigator.userAgent) || params.get('tv') === '1'
    try {
      if (params.get('tv') === '1') localStorage.setItem('samee3_tv_mode', '1')
      television = television || localStorage.getItem('samee3_tv_mode') === '1'
    } catch {}
    setTv(television); document.documentElement.classList.toggle('samee3-tv', television)
    const track = async (evidence: 'appinstalled' | 'standalone' | 'native') => {
      try {
        const id = installId(), key = `samee3_install_sent_v1:${id}`
        if (localStorage.getItem(key) === new Date().toISOString().slice(0, 10)) return
        const platform = television ? 'tv' : iosDevice() ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'desktop'
        const response = await fetch('/api/installations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, platform, evidence }), signal: timeoutSignal(12000) })
        if (response.ok) localStorage.setItem(key, new Date().toISOString().slice(0, 10))
      } catch {}
    }
    const onboard = () => {
      try {
        const allowed = android?.notificationsAllowed || ('Notification' in window && Notification.permission === 'granted' && Boolean(pushIdentity()))
        if ((installedWebApp() || android || television) && !allowed && !localStorage.getItem(PROMPT_KEY)) setPrompt(true)
      } catch {}
    }
    const installed = () => { void track('appinstalled'); onboard() }
    const online = () => { if (android) void track('native'); else if (installedWebApp() || television) void track('standalone') }
    online(); onboard()
    window.addEventListener('appinstalled', installed); window.addEventListener('online', online)
    return () => { window.removeEventListener('appinstalled', installed); window.removeEventListener('online', online) }
  }, [android?.platform, android?.notificationsAllowed])
  useEffect(() => {
    if (!prompt || android || !pushSupport()) return
    const controller = new AbortController()
    void fetchWebPushConfig(controller.signal).then(value => { if (!controller.signal.aborted) setConfig(value) }).catch(() => {})
    return () => controller.abort()
  }, [prompt, android?.platform])
  useEffect(() => {
    if (!tv) return
    const move = (event: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return
      const active = document.activeElement as HTMLElement | null
      if (active?.matches('input,textarea,select,[contenteditable=true]')) return
      const candidates = [...document.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(item => {
        const rect = item.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && getComputedStyle(item).visibility !== 'hidden' && !item.closest('[inert],[aria-hidden="true"]')
      })
      if (!candidates.length) return
      const origin = active?.getBoundingClientRect(), x = origin ? origin.left + origin.width / 2 : innerWidth / 2, y = origin ? origin.top + origin.height / 2 : 0
      let best: HTMLElement | null = null, score = Infinity
      for (const item of candidates) {
        if (item === active) continue
        const rect = item.getBoundingClientRect(), dx = rect.left + rect.width / 2 - x, dy = rect.top + rect.height / 2 - y
        const horizontal = event.key === 'ArrowRight' || event.key === 'ArrowLeft', forward = event.key === 'ArrowRight' ? dx : event.key === 'ArrowLeft' ? -dx : event.key === 'ArrowDown' ? dy : -dy
        if (forward <= 5) continue
        const distance = forward + Math.abs(horizontal ? dy : dx) * 3
        if (distance < score) { score = distance; best = item }
      }
      if (best) { event.preventDefault(); best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' }) }
      else if (!active || active === document.body) { event.preventDefault(); candidates[0].focus() }
    }
    window.addEventListener('keydown', move)
    return () => window.removeEventListener('keydown', move)
  }, [tv, pathname])
  useEffect(() => {
    if (!tv || android) return
    // TVs without Push API still receive visible reminders while the app is open.
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      try {
        if (localStorage.getItem('samee3_tv_reminders') !== '1') return
        const settings = readWebSettings(), now = Date.now()
        const days = JSON.parse(localStorage.getItem('samee3_prayer_days_v1') || 'null')?.days || []
        const due = reminderEvents(settings, now - 60000, days).find(event => event.at <= now)
        if (!due) return
        const key = `${due.kind}:${due.at}`
        if (sessionStorage.getItem('samee3_tv_last_reminder') === key) return
        sessionStorage.setItem('samee3_tv_last_reminder', key); setReminder(due)
      } catch {}
    }
    tick(); const timer = setInterval(tick, 15000)
    return () => clearInterval(timer)
  }, [tv, android?.platform])
  const dismiss = () => { try { localStorage.setItem(PROMPT_KEY, 'shown') } catch {}; setPrompt(false) }
  const enable = () => {
    setBusy(true); setNotice('')
    const task = android ? nativeRequest('permission') : config?.publicKey ? enableWebPush(readWebSettings(), config.publicKey) : Promise.reject(new Error('افتح إعدادات الإشعارات لاختيار مواعيدك.'))
    void task.then(() => dismiss()).catch(cause => setNotice(cause.message)).finally(() => setBusy(false))
  }
  return <>
    {tv && <div className="fixed left-3 top-3 z-[115] flex gap-2"><Link href="/" className="rounded-xl bg-white/95 px-3 py-2 text-xs font-bold text-emerald-900 shadow">الرئيسية</Link><button type="button" aria-label="ملء الشاشة" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen?.(); else void document.documentElement.requestFullscreen?.().catch(() => {}) }} className="rounded-xl bg-white/95 p-2 text-emerald-900 shadow"><Maximize size={18}/></button></div>}
    {prompt && !pathname.startsWith('/notifications') && !pathname.startsWith('/admin') && <aside dir="rtl" aria-label="تفعيل إشعارات سميع" className="fixed inset-x-4 top-4 z-[130] mx-auto max-w-md rounded-3xl border border-[#dbc69e] bg-white p-5 text-slate-800 shadow-2xl"><div className="flex gap-3"><BellRing className="shrink-0 text-emerald-800" size={25}/><div className="flex-1"><h2 className="font-bold text-emerald-900">فعّل تذكيرات سميع</h2><p className="mt-2 text-xs leading-7">اسمح بإشعارات الورد والأذكار والصلاة، واختر المواعيد المناسبة لك.</p></div><button type="button" onClick={dismiss} aria-label="لاحقًا" className="self-start p-1"><X size={18}/></button></div><div className="mt-4 flex gap-2">{(android || config?.configured) && <button type="button" disabled={busy} onClick={enable} className="min-h-11 flex-1 rounded-xl bg-emerald-800 px-3 text-sm font-bold text-white disabled:opacity-50">السماح بالإشعارات</button>}<Link href="/notifications" onClick={dismiss} className="flex min-h-11 flex-1 items-center justify-center rounded-xl border px-3 text-sm font-bold">ضبط المواعيد</Link></div>{notice && <p role="alert" className="mt-3 text-xs leading-6 text-amber-900">{notice}</p>}</aside>}
    {reminder && <aside dir="rtl" role="status" className="fixed right-5 top-5 z-[140] flex items-center gap-4 rounded-2xl bg-emerald-950 p-5 text-white shadow-2xl"><BellRing/><Link href={reminder.url}>{reminder.title}</Link><button type="button" onClick={() => setReminder(null)} aria-label="إغلاق التذكير"><X size={18}/></button></aside>}
  </>
}
