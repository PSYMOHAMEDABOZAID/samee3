'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { BellRing, BookOpen, ChevronRight, Check, Clock, Headphones, Heart, LibraryBig, Loader2, MapPin, MessageCircle, Settings, Volume2 } from 'lucide-react'
import AndroidAppCard from '@/components/AndroidAppCard'
import WebNotificationsPanel from '@/components/WebNotificationsPanel'
import adhanCatalog from '@/native/shared/adhan-catalog.json'
import { DEFAULT_REMINDERS, nativeRequest, useAndroidApp, type ReminderSettings } from '@/lib/android-native'

const PRAYERS = [['Fajr', 'الفجر'], ['Dhuhr', 'الظهر'], ['Asr', 'العصر'], ['Maghrib', 'المغرب'], ['Isha', 'العشاء']]
const METHODS = [[8, 'الخليج'], [4, 'أم القرى — مكة'], [5, 'الهيئة المصرية للمساحة'], [3, 'رابطة العالم الإسلامي'], [1, 'جامعة كراتشي'], [2, 'أمريكا الشمالية'], [9, 'الكويت'], [10, 'قطر'], [11, 'سنغافورة'], [12, 'فرنسا'], [13, 'تركيا'], [15, 'لجنة رؤية الهلال'], [18, 'تونس'], [19, 'الجزائر'], [20, 'إندونيسيا'], [21, 'المغرب'], [22, 'البرتغال'], [23, 'وزارة الأوقاف الأردنية']] as const
type ToggleKey = 'quran' | 'adhkar' | 'hadith' | 'prayer' | 'audio' | 'library'

export default function NotificationsPage() {
  const { status, setStatus, connecting, nativeBrowser, refresh } = useAndroidApp()
  const [form, setForm] = useState<ReminderSettings>(DEFAULT_REMINDERS)
  const [busy, setBusy] = useState(false), [locating, setLocating] = useState(false)
  const [notice, setNotice] = useState(''), [error, setError] = useState('')
  const initialized = useRef(false)
  useEffect(() => {
    if (status && !initialized.current) { initialized.current = true; setForm({ ...DEFAULT_REMINDERS, ...status.settings }) }
  }, [status])
  useEffect(() => {
    if (!status || !form.prayer) return
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh().catch(() => undefined) }, 8000)
    return () => clearInterval(timer)
  }, [status?.platform, form.prayer, refresh])
  const change = <K extends keyof ReminderSettings>(key: K, value: ReminderSettings[K]) => setForm((old) => ({ ...old, [key]: value }))
  const toggle = (key: ToggleKey) => change(key, !form[key])
  const command = async (type: string, payload?: unknown) => {
    setError(''); setNotice(''); setBusy(true)
    try { const value = await nativeRequest(type, payload); setStatus(value); if (type === 'test') setNotice('أُرسل حديث تجريبي إلى إشعارات الهاتف. اسحب لوحة الإشعارات لقراءته.'); if (type === 'adhanDownloadAll') setNotice('بدأ تحميل مكتبة الأذان. اترك التطبيق مفتوحًا حتى يظهر اكتمال الأصوات.'); if (type === 'adhanDownload') setNotice('بدأ تجهيز الصوت وحفظه على الهاتف. يظهر وضع التنزيل بجانب الاختيار.'); if (type === 'adhanPreview') setNotice('جارٍ تجهيز معاينة الصوت. يمكنك الإيقاف من الزر أو إشعار الهاتف.'); if (type === 'adhanStop') setNotice('أُوقف تشغيل الأذان.'); if (type === 'refreshPrayer') setNotice('طُلب تحديث جدول الصلاة. يتم التنزيل عند توفر اتصال بالإنترنت.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر تنفيذ الطلب.') }
    finally { setBusy(false) }
  }
  const save = async () => {
    setError(''); setNotice('')
    if (!Number.isInteger(form.hadithStart) || !Number.isInteger(form.hadithEnd) || form.hadithStart < 0 || form.hadithEnd > 24 || form.hadithStart >= form.hadithEnd) { setError('حدد ساعات صحيحة لقراءة الحديث، ويجب أن تسبق البداية النهاية.'); return }
    for (const key of ['quranTime', 'morningTime', 'eveningTime', 'audioTime', 'libraryTime'] as const) {
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(form[key])) { setError('أكمل مواعيد التذكيرات بصيغة ساعة ودقيقة.'); return }
    }
    try { new Intl.DateTimeFormat('ar', { timeZone: form.timezone }).format() } catch { setError('اكتب منطقة زمنية صحيحة، مثل Asia/Muscat أو Africa/Cairo.'); return }
    if (form.prayer && (!Number.isFinite(form.latitude) || !Number.isFinite(form.longitude) || Math.abs(form.latitude!) > 90 || Math.abs(form.longitude!) > 180)) { setError('حدد موقعك أولًا حتى تكون تنبيهات الصلاة لموقعك أنت.'); return }
    if (form.prayer && !form.prayers.length) { setError('اختر صلاة واحدة على الأقل أو أوقف تنبيهات الصلاة.'); return }
    setBusy(true)
    try {
      let permission = status
      if (Object.entries(form).some(([key, value]) => ['quran', 'adhkar', 'hadith', 'prayer', 'audio', 'library'].includes(key) && value === true) && !status?.notificationsAllowed) permission = await nativeRequest('permission')
      const value = await nativeRequest('saveSettings', form)
      setStatus(value); setForm(value.settings)
      setNotice(permission?.notificationsAllowed || value.notificationsAllowed ? 'حُفظت مواعيدك على هذا الهاتف. التذكيرات تعمل دون إبقاء التطبيق مفتوحًا.' : 'حُفظت المواعيد، لكن إشعارات سميع محجوبة. اسمح بها من إعدادات الهاتف لتظهر التذكيرات.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'لم تكتمل عملية الحفظ.') }
    finally { setBusy(false) }
  }
  const locate = () => {
    setError(''); setNotice('')
    if (!navigator.geolocation) { setError('تحديد الموقع غير متاح. يمكنك كتابة الإحداثيات يدويًا.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition((position) => {
      setForm((old) => ({ ...old, latitude: position.coords.latitude, longitude: position.coords.longitude, city: 'موقعي الحالي', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }))
      setLocating(false); setNotice('تم تحديد موقع الهاتف. راجع طريقة الحساب ثم احفظ الإعدادات.')
    }, () => { setLocating(false); setError('لم نتمكن من تحديد موقعك. اسمح بالموقع من إعدادات الهاتف أو اكتب الإحداثيات يدويًا.') }, { timeout: 15000, maximumAge: 60000, enableHighAccuracy: true })
  }
  const fieldClass = 'min-h-11 w-full rounded-xl border border-[#ddd1b9] bg-white px-3 py-2 text-sm text-slate-800'
  const time = (label: string, key: 'quranTime' | 'morningTime' | 'eveningTime' | 'audioTime' | 'libraryTime') => <label className="grid gap-2 text-xs font-bold text-slate-600">{label}<input aria-label={label} type="time" required value={form[key]} onChange={(event) => change(key, event.target.value)} className={fieldClass} /></label>
  const switchButton = (key: ToggleKey, label: string) => <button type="button" role="switch" aria-checked={form[key]} aria-label={label} onClick={() => toggle(key)} className={`flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors ${form[key] ? 'bg-[#194f43]' : 'bg-slate-200'}`}><span className={`h-6 w-6 rounded-full bg-white shadow transition-transform ${form[key] ? '-translate-x-6' : ''}`} /></button>
  const title = (key: ToggleKey, text: string, description: string, icon: ReactNode) => <div className="mb-4 flex items-start gap-3"><span className="rounded-xl bg-[#f7efdf] p-2.5 text-[#8a642d]">{icon}</span><div className="min-w-0 flex-1"><h2 className="text-sm font-extrabold text-[#194f43]">{text}</h2><p className="mt-1 text-xs leading-6 text-slate-500">{description}</p></div>{switchButton(key, text)}</div>
  const panel = 'rounded-3xl border border-[#e1d5c0] bg-white p-5 shadow-sm'
  if (!connecting && !status && !nativeBrowser) return <WebNotificationsPanel />
  return <main className="min-h-screen bg-[var(--bg-main)] px-4 pb-32 pt-5" dir="rtl"><div className="mx-auto max-w-3xl">
    <header className="mb-6 flex items-center gap-3"><Link href="/" aria-label="العودة للرئيسية" className="rounded-full bg-white p-3 text-[#194f43] shadow-sm"><ChevronRight size={22} /></Link><div><h1 className="text-xl font-extrabold text-[#194f43]">الإشعارات والتذكيرات</h1><p className="mt-1 text-xs text-slate-500">مواعيدك محفوظة على هذا الهاتف، ولا تحتاج تسجيل دخول</p></div></header>
    {connecting && <p role="status" className="mb-4 flex items-center gap-2 rounded-2xl bg-white p-4 text-sm"><Loader2 size={18} className="animate-spin" />جارٍ الاتصال بتطبيق أندرويد…</p>}
    {!connecting && !status && <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">{nativeBrowser ? 'هذه النسخة تحتاج تحديث APK لتفعيل إشعارات الهاتف والتصميم الأساسي.' : 'التذكيرات أثناء إغلاق التطبيق متاحة في نسخة أندرويد. نزّلها من الرئيسية ثم افتح هذه الصفحة من داخل التطبيق.'}</div>}
    {!status && <AndroidAppCard />}
    {status && <section className={`${panel} mb-5`}>
      <div className="flex items-center gap-2 font-bold text-[#194f43]"><BellRing size={20} />{status.notificationsAllowed ? 'إشعارات سميع مسموح بها' : 'إشعارات سميع محجوبة على هذا الهاتف'}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!status.notificationsAllowed && <button type="button" disabled={busy} onClick={() => void command('permission')} className="rounded-xl bg-[#194f43] px-4 py-3 text-xs font-bold text-white">السماح بالإشعارات</button>}
        <button type="button" disabled={busy} onClick={() => void command('notificationSettings')} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-xs font-bold"><Settings size={15} />إعدادات الهاتف والصوت</button>
        <button type="button" disabled={busy || !status.notificationsAllowed} onClick={() => void command('test')} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-xs font-bold disabled:opacity-50"><MessageCircle size={15} />اختبار إشعار حديث</button>
        <button type="button" disabled={busy} onClick={() => setForm((old) => ({ ...old, quran: true, adhkar: true, hadith: true }))} className="rounded-xl border border-[#ddd1b9] px-3 py-3 text-xs font-bold">اختيار ورد وأذكار وحديث</button>
      </div>
    </section>}
    <fieldset disabled={!status || busy || connecting} className="grid gap-4 disabled:opacity-60">
      <section className={panel}>{title('quran', 'ورد القرآن', 'تذكير يومي يفتح المصحف لمتابعة القراءة.', <BookOpen size={21} />)}{form.quran && time('موعد ورد القرآن', 'quranTime')}</section>
      <section className={panel}>{title('adhkar', 'أذكار الصباح والمساء', 'تنبيهان يوميًا في المواعيد التي تختارها.', <Heart size={21} />)}{form.adhkar && <div className="grid grid-cols-2 gap-3">{time('أذكار الصباح', 'morningTime')}{time('أذكار المساء', 'eveningTime')}</div>}</section>
      <section className={panel}>{title('hadith', 'حديث على شاشة الإشعارات', 'أحاديث من صحيح البخاري، مع نص الحديث ومرجعه. الضغط يفتح النص داخل سميع.', <MessageCircle size={21} />)}
        {form.hadith && <div className="grid gap-4"><label className="grid gap-2 text-xs font-bold text-slate-600">التكرار<select value={form.hadithHours} onChange={(event) => change('hadithHours', Number(event.target.value))} className={fieldClass}>{[1, 2, 3, 4, 6, 12, 24].map((hours) => <option key={hours} value={hours}>{hours === 24 ? 'حديث يوميًا' : `كل ${hours} ساعة`}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="grid gap-2 text-xs font-bold text-slate-600">من الساعة<input type="number" min={0} max={22} value={form.hadithStart} onChange={(event) => change('hadithStart', Number(event.target.value))} className={fieldClass} /></label><label className="grid gap-2 text-xs font-bold text-slate-600">حتى الساعة<input type="number" min={1} max={24} value={form.hadithEnd} onChange={(event) => change('hadithEnd', Number(event.target.value))} className={fieldClass} /></label></div><p className="text-xs leading-6 text-slate-500">لا تُرسل أحاديث خارج هذه الفترة. الساعات بنظام ٢٤ ساعة.</p></div>}
      </section>
      <section className={panel}>{title('prayer', 'تنبيهات الأذان ومواقيت الصلاة', 'أذان كامل بالصوت الذي تختاره عند دخول وقت الصلاة، بحسب موقعك وطريقة الحساب.', <Volume2 size={21} />)}
        {form.prayer && <div className="grid gap-4">
          <div className="rounded-2xl border border-[#ddd1b9] bg-[#faf8f3] p-4">
            <label className="flex min-h-10 items-center gap-3 text-sm font-bold text-[#194f43]"><input type="checkbox" checked={form.fullAdhan} onChange={(event) => change('fullAdhan', event.target.checked)} />تشغيل الأذان كاملًا بالصوت المختار</label>
            {form.fullAdhan && <div className="mt-4 grid gap-4">
              <label className="grid gap-2 text-xs font-bold text-slate-600">المؤذن — ٢٠ صوتًا<select value={form.adhanVoice} onChange={(event) => change('adhanVoice', event.target.value)} className={fieldClass}>{adhanCatalog.voices.filter((voice) => !voice.fajr).map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}</select></label>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void command('adhanPreview', { id: form.adhanVoice })} className="min-h-10 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#194f43]">معاينة الصوت</button><button type="button" onClick={() => void command('adhanDownload', { id: form.adhanVoice })} className="min-h-10 rounded-xl border border-[#ddd1b9] px-3 py-2 text-xs font-bold">تحميل الصوت للهاتف</button></div>
              <p role="status" className="text-xs text-slate-600">حالة الصوت: {({ ready: 'محفوظ ويعمل دون إنترنت', downloading: 'جارٍ التنزيل…', error: 'تعذر التنزيل؛ أعد المحاولة', missing: 'يحتاج التنزيل أول مرة' } as Record<string, string>)[status?.adhanDownloads?.[form.adhanVoice] || 'missing']}</p>
              <label className="grid gap-2 text-xs font-bold text-slate-600">صوت الفجر<select value={form.fajrVoice} onChange={(event) => change('fajrVoice', event.target.value)} className={fieldClass}>{adhanCatalog.voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}{voice.fajr ? ' — تسجيل خاص بالفجر' : ''}</option>)}</select></label>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void command('adhanPreview', { id: form.fajrVoice })} className="min-h-10 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#194f43]">معاينة الفجر</button><button type="button" onClick={() => void command('adhanDownload', { id: form.fajrVoice })} className="min-h-10 rounded-xl border border-[#ddd1b9] px-3 py-2 text-xs font-bold">تحميل صوت الفجر</button></div>
              <label className="grid gap-2 text-xs font-bold text-slate-600">مستوى صوت الأذان: {form.adhanVolume}٪<input aria-label="مستوى صوت الأذان" type="range" min={1} max={100} value={form.adhanVolume} onChange={(event) => change('adhanVolume', Number(event.target.value))} /></label>
              <button type="button" onClick={() => void command('adhanStop')} className="min-h-11 rounded-xl border border-red-200 bg-white px-3 py-3 text-xs font-bold text-red-800">إيقاف المعاينة أو الأذان الحالي</button>
              <button type="button" onClick={() => void command('adhanDownloadAll')} className="min-h-11 rounded-xl border border-[#ddd1b9] bg-white px-3 py-3 text-xs font-bold text-[#194f43]">تحميل كل الأصوات للعمل دون إنترنت — {(adhanCatalog.voices.reduce((sum, voice) => sum + voice.bytes, 0) / 1024 / 1024).toFixed(1)} ميجابايت</button>
              <p className="text-xs leading-6 text-slate-500">المحفوظ: {adhanCatalog.voices.filter((voice) => status?.adhanDownloads?.[voice.id] === 'ready').length} من {adhanCatalog.voices.length} تسجيلًا. الأصوات تُحمّل مرة واحدة. يوجد أذان افتراضي وتسجيل للفجر داخل التطبيق؛ يُستخدم الاحتياطي إذا لم يكتمل تنزيل الصوت المختار. يتبع التشغيل صوت المنبّه ووضع عدم الإزعاج في الهاتف.</p>
            </div>}
          </div>
          <button type="button" disabled={locating} onClick={locate} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#f7efdf] px-4 py-3 text-sm font-bold text-[#194f43]">{locating ? <Loader2 size={17} className="animate-spin" /> : <MapPin size={17} />}استخدم موقع هاتفي</button>
          <label className="grid gap-2 text-xs font-bold text-slate-600">اسم الموقع<input value={form.city} maxLength={100} onChange={(event) => change('city', event.target.value)} className={fieldClass} /></label>
          <details className="rounded-xl bg-slate-50 p-3 text-xs leading-6"><summary className="cursor-pointer font-bold">كتابة الإحداثيات يدويًا</summary><div className="mt-3 grid grid-cols-2 gap-3"><label>خط العرض<input dir="ltr" type="number" min={-90} max={90} step="any" value={form.latitude ?? ''} onChange={(event) => change('latitude', event.target.value === '' ? undefined : Number(event.target.value))} className={fieldClass} /></label><label>خط الطول<input dir="ltr" type="number" min={-180} max={180} step="any" value={form.longitude ?? ''} onChange={(event) => change('longitude', event.target.value === '' ? undefined : Number(event.target.value))} className={fieldClass} /></label></div></details>
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-2 text-xs font-bold text-slate-600">طريقة الحساب<select value={form.method} onChange={(event) => change('method', Number(event.target.value))} className={fieldClass}>{METHODS.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label><label className="grid gap-2 text-xs font-bold text-slate-600">حساب العصر<select value={form.school} onChange={(event) => change('school', Number(event.target.value))} className={fieldClass}><option value={0}>الجمهور</option><option value={1}>الحنفي</option></select></label></div>
          <div className="flex flex-wrap gap-3">{PRAYERS.map(([id, name]) => <label className="flex min-h-10 items-center gap-2 text-sm" key={id}><input type="checkbox" checked={form.prayers.includes(id)} onChange={(event) => change('prayers', event.target.checked ? [...form.prayers, id] : form.prayers.filter((key) => key !== id))} />{name}</label>)}</div>
          {status && !status.exactAlarmsAllowed && <div className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900">دقة موعد الصلاة تحتاج إذن «المنبّهات والتذكيرات». بدونه قد يتأخر التنبيه، ولن يبدأ الأذان الكامل تلقائيًا في الخلفية؛ يمكنك تشغيله من الإشعار.<button type="button" onClick={() => void command('exactPermission')} className="mt-2 block rounded-lg border border-amber-300 px-3 py-2 font-bold">السماح بالتنبيهات الدقيقة</button></div>}
          <p className="text-xs leading-6 text-slate-500">{status?.calendarUntil ? `المواقيت محفوظة حتى ${status.calendarUntil}.` : 'يُنزّل جدول الأشهر بعد حفظ موقعك عند توفر الإنترنت.'} حدّث الموقع عند السفر، وراجع المواقيت مع الجهة المحلية. اختر المؤذن من هذه الصفحة. عند إيقاف الأذان الكامل يُستخدم صوت إشعار الهاتف.</p>
          {status?.calendarError && <p className="text-xs leading-6 text-amber-800">{status.calendarError}</p>}
          <button type="button" onClick={() => void command('refreshPrayer')} className="min-h-10 rounded-xl border border-[#ddd1b9] p-2 text-xs font-bold">إعادة تنزيل جدول الصلاة للموقع المحفوظ</button>
        </div>}
      </section>
      <section className={panel}>{title('audio', 'تذكير الاستماع', 'تذكير يومي يفتح المكتبة الصوتية؛ يبدأ الصوت عندما تختار تشغيله.', <Headphones size={21} />)}{form.audio && time('موعد الاستماع', 'audioTime')}</section>
      <section className={panel}>{title('library', 'المكتبة الشرعية', 'تذكير أسبوعي كل جمعة للقراءة والتعلّم.', <LibraryBig size={21} />)}{form.library && time('موعد المكتبة يوم الجمعة', 'libraryTime')}</section>
      <section className={panel}><label className="grid gap-2 text-xs font-bold text-slate-600"><span className="flex items-center gap-2"><Clock size={16} />المنطقة الزمنية للمواعيد</span><input dir="ltr" value={form.timezone} onChange={(event) => change('timezone', event.target.value)} className={fieldClass} /></label><button type="button" onClick={() => change('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)} className="mt-2 min-h-10 text-xs font-bold text-[#194f43]">استخدم منطقة الهاتف الحالية</button></section>
    </fieldset>
    {status && <div className="mt-5"><button type="button" disabled={busy || locating} onClick={() => void save()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#194f43] px-5 py-4 text-sm font-extrabold text-white disabled:opacity-60">{busy ? <Loader2 size={19} className="animate-spin" /> : <Check size={19} />}حفظ وتفعيل المواعيد المختارة</button><p className="mt-3 text-xs leading-6 text-slate-500">قد تؤخر أو تمنع قيود البطارية الصارمة والإيقاف الإجباري تنبيهات الهاتف. بعد الإيقاف الإجباري افتح التطبيق مجددًا. تغيير مواعيدك أو إيقاف فئة يلغي تنبيهاتها السابقة.</p></div>}
    {error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm leading-7 text-red-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm leading-7 text-emerald-900">{notice}</p>}
    {status && Object.keys(status.next).length > 0 && <section className={`${panel} mt-5`}><h2 className="mb-3 text-sm font-bold text-[#194f43]">المواعيد التالية المسجّلة في الهاتف</h2><ul className="grid gap-2 text-xs leading-6 text-slate-600">{Object.entries(status.next).map(([key, at]) => <li key={key}>{({ quran: 'ورد القرآن', morning: 'أذكار الصباح', evening: 'أذكار المساء', hadith: 'قراءة حديث', audio: 'الاستماع', library: 'المكتبة', ...Object.fromEntries(PRAYERS) } as Record<string, string>)[key]}: {new Intl.DateTimeFormat('ar', { dateStyle: 'short', timeStyle: 'short', timeZone: status.settings.timezone }).format(at)}</li>)}</ul></section>}
  </div></main>
}
