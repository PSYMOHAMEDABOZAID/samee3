'use client'
import { useEffect, useState } from 'react'
import { DEFAULT_WEB_REMINDERS, PRAYER_METHODS, parseWebSettings } from '@/lib/web-reminders'
import { enableWebPush, pushIdentity, readWebSettings, storeWebSettings } from '@/lib/web-push-client'
export default function PrayerPreferences({ latitude, longitude, city }: { latitude: number; longitude: number; city: string }) {
  const [settings, setSettings] = useState({ ...DEFAULT_WEB_REMINDERS, latitude, longitude, city }), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { setSettings({ ...readWebSettings(), latitude, longitude, city }) }, [latitude, longitude, city])
  const input = 'mt-1 min-h-11 w-full rounded-xl border border-[#dbd1bf] bg-white p-2 text-sm text-slate-800'
  const save = () => {
    try {
      if (settings.latitude === null || settings.longitude === null) throw new Error('أكمل إحداثيات الموقع أولًا.')
      const next = parseWebSettings(settings)
      storeWebSettings(next); setMessage('حُفظ الموقع وطريقة الحساب. جارٍ تحديث المواقيت.')
      if (pushIdentity() && process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY) {
        setBusy(true)
        void enableWebPush(next, process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY).then(() => setMessage('تم توحيد المواقيت وتنبيهات الصلاة للموقع المختار.')).catch(cause => setMessage(`حُفظت مواقيت العرض، لكن لم تتحدث الإشعارات: ${cause.message}`)).finally(() => setBusy(false))
      }
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'راجع الإعدادات.') }
  }
  return <details className="mx-auto mb-4 w-[calc(100%-2rem)] max-w-3xl rounded-2xl border border-[#ddd1b9] bg-white p-4 text-slate-800"><summary className="cursor-pointer text-sm font-bold text-emerald-900">الموقع وطريقة حساب الصلاة</summary><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs">اسم الموقع<input className={input} value={settings.city} onChange={event => setSettings(old => ({ ...old, city: event.target.value }))}/></label><label className="text-xs">المنطقة الزمنية<input dir="ltr" className={input} value={settings.timezone} onChange={event => setSettings(old => ({ ...old, timezone: event.target.value }))}/></label>{(['latitude', 'longitude'] as const).map(key => <label key={key} className="text-xs">{key === 'latitude' ? 'خط العرض' : 'خط الطول'}<input dir="ltr" type="number" step="any" className={input} value={settings[key] ?? ''} onChange={event => setSettings(old => ({ ...old, [key]: event.target.value ? Number(event.target.value) : null }))}/></label>)}<label className="text-xs">طريقة الحساب<select className={input} value={settings.method} onChange={event => setSettings(old => ({ ...old, method: Number(event.target.value) }))}>{PRAYER_METHODS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="text-xs">حساب العصر<select className={input} value={settings.school} onChange={event => setSettings(old => ({ ...old, school: Number(event.target.value) }))}><option value={0}>الجمهور</option><option value={1}>الحنفي</option></select></label></div><button type="button" disabled={busy} onClick={save} className="mt-4 min-h-11 rounded-xl bg-emerald-800 px-5 text-sm font-bold text-white disabled:opacity-50">حفظ وتحديث المواقيت</button><p className="mt-3 text-xs leading-6 text-slate-500">تختلف المواقيت باختلاف الجهة المعتمدة. اختر طريقة بلدك وقارنها بالجدول المحلي. يتم حفظ أسبوع للاستخدام دون إنترنت.</p>{message && <p role="status" className="mt-2 text-xs leading-6">{message}</p>}</details>
}
