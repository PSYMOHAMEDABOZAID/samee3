'use client'

import { timeoutSignal } from '@/lib/abort-signals'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BellRing, Check, ChevronRight, Loader2, MapPin } from 'lucide-react'
import { DEFAULT_WEB_REMINDERS, PRAYER_METHODS, parseWebSettings, reminderEvents, type ReminderEvent, type WebReminderSettings } from '@/lib/web-reminders'
import { PRAYERS, fetchPrayerDay, locationDate, shiftPrayerDate } from '@/lib/prayer-times'
import { disableWebPush, enableWebPush, installedWebApp, iosDevice, pushCommand, pushIdentity, pushSupport, readWebSettings, storeWebSettings } from '@/lib/web-push-client'
export default function WebNotificationsPanel() {
  const [form, setForm] = useState(DEFAULT_WEB_REMINDERS)
  const [config, setConfig] = useState<{ configured: boolean; publicKey?: string } | null>(null)
  const [supported, setSupported] = useState(false), [ios, setIos] = useState(false), [installed, setInstalled] = useState(false)
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false), [locating, setLocating] = useState(false)
  const [localTv, setLocalTv] = useState(false)
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [next, setNext] = useState<ReminderEvent[]>([])
  useEffect(() => {
    setForm(readWebSettings()); setSupported(pushSupport()); setIos(iosDevice()); setInstalled(installedWebApp())
    const television = document.documentElement.classList.contains('samee3-tv') || localStorage.getItem('samee3_tv_mode') === '1'
    setLocalTv(television)
    setEnabled((Boolean(pushIdentity()) && 'Notification' in window && Notification.permission === 'granted') || (television && localStorage.getItem('samee3_tv_reminders') === '1'))
    const controller = new AbortController()
    void fetch('/api/web-push', { cache: 'no-store', signal: controller.signal }).then(r => r.json()).then(setConfig).catch(() => setError('تعذر فحص خدمة الإشعارات. تحقق من الاتصال ثم أعد فتح الصفحة.'))
    if (pushIdentity()) void pushCommand('status').then(result => { setNext(result.next || []); if (result.lastError) setError(result.lastError) }).catch(() => {})
    return () => controller.abort()
  }, [])
  const change = <K extends keyof WebReminderSettings>(key: K, value: WebReminderSettings[K]) => setForm(old => ({ ...old, [key]: value }))
  const save = () => {
    if (localTv && !supported) {
      setBusy(true); setError('')
      void (async () => {
        const selected = parseWebSettings(form)
        let days: Awaited<ReturnType<typeof fetchPrayerDay>>[] = []
        if (selected.prayer && selected.latitude !== null && selected.longitude !== null) {
          const today = locationDate(new Date(), selected.timezone), params = new URLSearchParams({ latitude: String(selected.latitude), longitude: String(selected.longitude), method: String(selected.method), school: String(selected.school), timezone: selected.timezone })
          const signal = timeoutSignal(30000)
          days = await Promise.all([0, 1, 2].map(offset => fetchPrayerDay(`/api/prayer-times?${params}&date=${shiftPrayerDate(today, offset)}`, signal)))
          localStorage.setItem('samee3_prayer_days_v1', JSON.stringify({ days, ...selected }))
        }
        storeWebSettings(selected); localStorage.setItem('samee3_tv_reminders', '1'); setEnabled(true)
        setNext(reminderEvents(selected, Date.now(), days).slice(0, 8)); setMessage('تم تفعيل تذكيرات الشاشة أثناء فتح سميع. إغلاق التطبيق أو إطفاء الشاشة يوقف هذه التذكيرات.')
      })().catch(cause => setError(cause.message)).finally(() => setBusy(false))
      return
    }
    if (!config?.publicKey) return
    setBusy(true); setError(''); setMessage('')
    // No await before enableWebPush; the iPhone permission request retains the click gesture.
    void enableWebPush(form, config.publicKey).then(result => { setEnabled(true); setNext(result.next || []); setMessage('تم تفعيل الإشعارات وحفظ مواعيدك. يمكنك إغلاق التطبيق واستقبال التذكيرات عند توفر الإنترنت.') }).catch(cause => setError(cause instanceof Error ? cause.message : 'تعذر تفعيل الإشعارات.')).finally(() => setBusy(false))
  }
  const locate = () => {
    if (!navigator.geolocation) { setError('اكتب إحداثيات موقعك يدويًا.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(position => {
      setForm(old => ({ ...old, latitude: position.coords.latitude, longitude: position.coords.longitude, city: 'موقعي الحالي', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }))
      setLocating(false); setError('')
    }, () => { setLocating(false); setError('لم يُسمح بالموقع. أدخل الإحداثيات يدويًا أو اسمح بالموقع من إعدادات المتصفح.') }, { timeout: 12000, enableHighAccuracy: true, maximumAge: 60000 })
  }
  const input = 'min-h-11 w-full rounded-xl border border-[#ddd1b9] bg-white px-3 py-2 text-sm text-slate-800'
  const panel = 'rounded-3xl border border-[#e1d5c0] bg-white p-5 shadow-sm'
  const clock = (key: 'quranTime' | 'morningTime' | 'eveningTime' | 'audioTime' | 'libraryTime', label: string) => <label className="grid gap-2 text-xs text-slate-600">{label}<input aria-label={label} type="time" className={input} value={form[key]} onChange={event => change(key, event.target.value)}/></label>
  return <main dir="rtl" className="min-h-screen bg-[var(--bg-main)] px-4 pb-32 pt-5"><div className="mx-auto max-w-3xl space-y-4">
    <header className="mb-6 flex items-center gap-3"><Link href="/" className="rounded-full bg-white p-3" aria-label="العودة للرئيسية"><ChevronRight size={22}/></Link><div><h1 className="text-xl font-extrabold text-[#194f43]">إشعارات سميع</h1><p className="mt-1 text-xs text-slate-500">الآيفون وأندرويد والكمبيوتر • دون تسجيل دخول</p></div></header>
    <section className={panel}><h2 className="flex items-center gap-2 font-bold text-[#194f43]"><BellRing size={20}/>{enabled ? 'الإشعارات مفعّلة لهذا الجهاز' : 'اختر تذكيراتك واسمح بالإشعارات'}</h2>
      {ios && !installed && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-7">على الآيفون: افتح سميع في Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية. افتحه من الأيقونة، ثم اضغط زر التفعيل. تحتاج iOS 16.4 أو أحدث.</p>}
      {!supported && !(ios && !installed) && <p className="mt-3 text-sm leading-7 text-amber-800">هذا المتصفح لا يدعم إشعارات الويب. حدّث المتصفح أو استخدم نسخة أندرويد. يمكن للشاشات عرض التذكيرات أثناء فتح سميع.</p>}
      {config && !config.configured && !localTv && <p className="mt-3 text-sm leading-7 text-amber-800">خدمة الإشعارات في انتظار إعداد الإدارة. يمكنك تشغيلها بعد استكمال إعداد الخادم الموضح في دليل التحديث.</p>}
      <p className="mt-3 text-xs leading-6 text-slate-500">تنبيهات الصلاة على الويب تستخدم صوت إشعار النظام. تشغيل أذان كامل تلقائيًا أثناء إغلاق التطبيق يحتاج نسخة أندرويد؛ الآيفون لا يتيح ذلك لتطبيقات الويب.</p>
    </section>
    {(['quran', 'adhkar', 'hadith', 'prayer', 'audio', 'library'] as const).map(key => <section className={panel} key={key}>
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm font-bold text-[#194f43]">{({ quran: 'ورد القرآن', adhkar: 'أذكار الصباح والمساء', hadith: 'قراءة حديث', prayer: 'تنبيهات الصلاة', audio: 'تذكير الاستماع', library: 'المكتبة الشرعية يوم الجمعة' })[key]}<input type="checkbox" className="h-5 w-5 accent-emerald-800" checked={form[key]} onChange={event => change(key, event.target.checked)}/></label>
      {form[key] && <div className="mt-4 grid gap-4">{key === 'quran' && clock('quranTime', 'موعد الورد')}{key === 'adhkar' && <div className="grid gap-3 sm:grid-cols-2">{clock('morningTime', 'أذكار الصباح')}{clock('eveningTime', 'أذكار المساء')}</div>}{key === 'audio' && clock('audioTime', 'وقت الاستماع')}{key === 'library' && clock('libraryTime', 'وقت المكتبة يوم الجمعة')}
        {key === 'hadith' && <div className="grid grid-cols-3 gap-2">{([['hadithStart', 'بداية الساعة', 0, 23], ['hadithEnd', 'نهاية الساعة', 1, 24], ['hadithHours', 'كل كم ساعة', 1, 12]] as const).map(([field, label, min, max]) => <label className="text-xs" key={field}>{label}<input type="number" min={min} max={max} className={input} value={form[field]} onChange={event => change(field, Number(event.target.value))}/></label>)}</div>}
        {key === 'prayer' && <><button disabled={locating} type="button" onClick={locate} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#f7efdf] text-sm font-bold">{locating ? <Loader2 size={17} className="animate-spin"/> : <MapPin size={17}/>}استخدم موقعي</button><label className="text-xs">اسم الموقع<input className={input} value={form.city} onChange={event => change('city', event.target.value)}/></label><div className="grid gap-3 sm:grid-cols-2">{(['latitude', 'longitude'] as const).map(field => <label key={field} className="text-xs">{field === 'latitude' ? 'خط العرض' : 'خط الطول'}<input dir="ltr" type="number" step="any" min={field === 'latitude' ? -90 : -180} max={field === 'latitude' ? 90 : 180} className={input} value={form[field] ?? ''} onChange={event => change(field, event.target.value ? Number(event.target.value) : null)}/></label>)}<label className="text-xs">طريقة الحساب<select className={input} value={form.method} onChange={event => change('method', Number(event.target.value))}>{PRAYER_METHODS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="text-xs">حساب العصر<select className={input} value={form.school} onChange={event => change('school', Number(event.target.value))}><option value={0}>الجمهور</option><option value={1}>الحنفي</option></select></label></div><div className="flex flex-wrap gap-4">{PRAYERS.map(prayer => <label key={prayer.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={form.prayers.includes(prayer.id)} onChange={event => change('prayers', event.target.checked ? [...form.prayers, prayer.id] : form.prayers.filter(id => id !== prayer.id))}/>{prayer.name}</label>)}</div><p className="text-xs leading-6 text-slate-500">الموقع وطريقة الحساب يُستخدمان أيضًا في صفحة مواقيت الصلاة. راجع المواقيت مع الجهة المحلية وحدّث موقعك عند السفر.</p></>}
      </div>}
    </section>)}
    <section className={panel}><label className="grid gap-2 text-xs">المنطقة الزمنية<input dir="ltr" className={input} value={form.timezone} onChange={event => change('timezone', event.target.value)}/></label><button type="button" onClick={() => change('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)} className="mt-2 min-h-10 text-xs font-bold text-emerald-800">استخدام منطقة الجهاز</button></section>
    <button type="button" disabled={busy || (!(localTv && !supported) && (!supported || !config?.configured || (ios && !installed)))} onClick={save} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#194f43] p-4 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin"/> : <Check size={18}/>} {enabled ? 'حفظ وتحديث المواعيد' : localTv && !supported ? 'تفعيل تذكيرات الشاشة' : 'السماح بالإشعارات وتفعيل المواعيد'}</button>
    {enabled && <div className="flex flex-wrap gap-3">{supported && <button disabled={busy} type="button" className="min-h-11 rounded-xl border bg-white px-4 text-sm" onClick={() => { setError(''); void pushCommand('test').then(() => setMessage('أُرسل إشعار تجريبي. راجع مركز الإشعارات.')).catch(cause => setError(cause.message)) }}>اختبار إشعار</button>}<button disabled={busy} type="button" className="min-h-11 rounded-xl border bg-white px-4 text-sm text-red-800" onClick={() => { setBusy(true); localStorage.removeItem('samee3_tv_reminders'); void (supported ? disableWebPush() : Promise.resolve()).then(() => { setEnabled(false); setNext([]); setMessage('أُوقفت إشعارات هذا الجهاز.') }).catch(cause => setError(cause.message)).finally(() => setBusy(false)) }}>إيقاف الإشعارات</button></div>}
    {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm leading-7 text-red-800">{error}</p>}{message && <p role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm leading-7 text-emerald-900">{message}</p>}
    {next.length > 0 && <section className={panel}><h2 className="mb-3 text-sm font-bold">التذكيرات التالية</h2><ul className="space-y-2 text-xs leading-6">{next.map(event => <li key={`${event.kind}-${event.at}`}>{event.title} • {new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short' }).format(event.at)}</li>)}</ul></section>}
  </div></main>
}
