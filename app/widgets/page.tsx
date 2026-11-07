'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight, ArrowUp, ArrowDown, Check, RefreshCw, Smartphone,
  ShieldCheck, RotateCcw, Info, ExternalLink, Moon, Sun, Settings2,
} from 'lucide-react'
import {
  buildWidgetSnapshot, DEFAULT_WIDGET_SETTINGS, getTasbihCount,
  loadWidgetSettings, saveWidgetSettings, updateTasbih,
  WIDGET_CATALOG, type WidgetId, type WidgetSettings, type WidgetTheme,
} from '@/lib/samee3-widgets'

const THEMES: Record<WidgetTheme, { name: string; background: string; text: string; muted: string; accent: string }> = {
  emerald: { name: 'زمردي', background: 'linear-gradient(135deg,#093d30,#145b48)', text: '#ffffff', muted: '#d5f4e8', accent: '#e1b96f' },
  ivory: { name: 'عاجي', background: 'linear-gradient(135deg,#fffaf0,#f2e9d8)', text: '#23463d', muted: '#566d63', accent: '#906a2e' },
  midnight: { name: 'ليلي', background: 'linear-gradient(135deg,#0c1725,#243652)', text: '#ffffff', muted: '#d4deed', accent: '#f2c97c' },
  sand: { name: 'رملي', background: 'linear-gradient(135deg,#74583b,#a17e53)', text: '#ffffff', muted: '#f9e9d4', accent: '#ffe3a4' },
  royal: { name: 'ملكي', background: 'linear-gradient(135deg,#192e61,#35558f)', text: '#ffffff', muted: '#dbe8ff', accent: '#f2d594' },
  rose: { name: 'وردي', background: 'linear-gradient(135deg,#6a3b4c,#975e71)', text: '#ffffff', muted: '#ffe9f2', accent: '#f9cc8b' },
}
const SIZES = [
  { id: 'small', label: 'صغير' }, { id: 'medium', label: 'متوسط' }, { id: 'large', label: 'كبير' },
] as const
function SettingToggle({ checked, title, subtitle, onChange }: { checked: boolean; title: string; subtitle: string; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} aria-pressed={checked} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-right transition hover:border-emerald-400">
      <span><span className="block text-sm font-bold text-slate-800">{title}</span><span className="block text-xs leading-6 text-slate-500">{subtitle}</span></span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-emerald-700' : 'bg-slate-300'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? 'right-1' : 'right-6'}`} /></span>
    </button>
  )
}
export default function WidgetsPage() {
  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_WIDGET_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [filter, setFilter] = useState('الكل')
  const [notice, setNotice] = useState('')
  useEffect(() => { setSettings(loadWidgetSettings()); setLoaded(true) }, [])
  useEffect(() => {
    if (!loaded) return
    saveWidgetSettings(settings)
    setRefresh(value => value + 1)
  }, [settings, loaded])
  useEffect(() => {
    const sync = () => setRefresh(value => value + 1)
    window.addEventListener('focus', sync)
    window.addEventListener('samee3:widget-settings', sync)
    return () => {
      window.removeEventListener('focus', sync)
      window.removeEventListener('samee3:widget-settings', sync)
    }
  }, [])
  const snapshot = useMemo(() => buildWidgetSnapshot(settings), [settings, refresh])
  const enabled = new Set(settings.enabled)
  const groups = useMemo(() => ['الكل', ...Array.from(new Set(WIDGET_CATALOG.map(item => item.group)))], [])
  const ordered = settings.order.map(id => WIDGET_CATALOG.find(item => item.id === id)!).filter(item => filter === 'الكل' || item.group === filter)
  const patch = (input: Partial<WidgetSettings>) => setSettings(prev => ({ ...prev, ...input }))
  const toggle = (id: WidgetId) => patch({ enabled: enabled.has(id) ? settings.enabled.filter(item => item !== id) : [...settings.enabled, id] })
  const move = (id: WidgetId, delta: number) => {
    const order = [...settings.order]
    const from = order.indexOf(id)
    const to = from + delta
    if (to < 0 || to >= order.length) return
    ;[order[from], order[to]] = [order[to], order[from]]
    patch({ order })
  }
  const reset = () => { patch({ ...DEFAULT_WIDGET_SETTINGS, enabled: [...DEFAULT_WIDGET_SETTINGS.enabled], order: [...DEFAULT_WIDGET_SETTINGS.order] }); setNotice('رجعنا الإعدادات الافتراضية') }
  const native = typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent)
  return (
    <main dir="rtl" className="min-h-screen bg-[#f7f6f1] pb-32 text-[#183c32]">
      <header className="relative overflow-hidden bg-gradient-to-bl from-[#083c2f] via-[#125743] to-[#214f41] px-5 pb-14 pt-8 text-white">
        <div className="pointer-events-none absolute -left-10 -top-20 h-64 w-64 rounded-full border-[35px] border-white/5" />
        <div className="mx-auto max-w-6xl">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-semibold hover:bg-white/25"><ArrowRight size={16} /> الرئيسية</Link>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
            <div><p className="mb-2 text-sm font-bold tracking-wide text-[#f2dca5]">SAMEE3 · WIDGET STUDIO</p><h1 className="text-3xl font-black sm:text-4xl">مركز ويدجت سميع</h1><p className="mt-3 max-w-xl text-sm leading-8 text-emerald-50">خصّص بطاقاتك، وتحكم في ظهورها وألوانها وترتيبها. بيانات القراءة والأذكار والمواقيت تأتي من سميع نفسه.</p></div>
            <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-center backdrop-blur"><span className="block text-3xl font-black">{settings.enabled.length.toLocaleString('ar-EG')}</span><span className="text-xs text-emerald-100">ويدجت مفعّلة</span></div>
          </div>
        </div>
      </header>
      <div className="relative mx-auto -mt-8 grid max-w-6xl gap-6 px-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <section className="min-w-0 space-y-6">
          <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-xl font-extrabold">مظهر الويدجت</h2><p className="mt-1 text-xs text-slate-500">ستة ألوان وثلاثة أحجام مع خيارات عرض إضافية</p></div><Settings2 className="text-emerald-800" size={22} /></div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">{(Object.entries(THEMES) as [WidgetTheme, typeof THEMES[WidgetTheme]][]).map(([id, color]) => (
              <button key={id} type="button" onClick={() => patch({ theme: id })} aria-pressed={settings.theme === id} className={`rounded-2xl border-2 p-2 transition ${settings.theme === id ? 'border-emerald-700 shadow-md' : 'border-transparent hover:border-slate-200'}`}>
                <span className="relative block h-12 rounded-xl" style={{ background: color.background }}>{settings.theme === id && <Check size={19} className="absolute left-2 top-3 text-white drop-shadow" />}</span><span className="mt-2 block text-center text-xs font-bold">{color.name}</span>
              </button>
            ))}</div>
            <div className="my-5 border-t border-slate-100" />
            <p className="mb-2 text-sm font-bold">حجم البطاقة</p><div className="mb-5 grid grid-cols-3 gap-2">{SIZES.map(s => <button type="button" key={s.id} onClick={() => patch({ size: s.id })} className={`rounded-xl border px-4 py-3 text-sm font-bold ${settings.size === s.id ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}>{s.label}</button>)}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <SettingToggle checked={settings.showDetails} title="إظهار التفاصيل" subtitle="الصفحة والقارئ وبيانات الويدجت" onChange={() => patch({ showDetails: !settings.showDetails })} />
              <SettingToggle checked={settings.arabicDigits} title="الأرقام العربية" subtitle="اختيار شكل الأرقام في البطاقات" onChange={() => patch({ arabicDigits: !settings.arabicDigits })} />
              <div className="sm:col-span-2"><SettingToggle checked={settings.showPersonalData} title="السماح ببيانات التقدم المحلية" subtitle="إخفاؤها يمنع إرسال آخر صفحة والعداد والتقدم إلى الويدجت الأصلية" onChange={() => patch({ showPersonalData: !settings.showPersonalData })} /></div>
            </div>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-extrabold">الأقسام المتاحة</h2><p className="mt-1 text-xs text-slate-500">فعّل أو عطّل ورتّب كل قسم كما تحب</p></div><button type="button" onClick={reset} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><RotateCcw size={14} /> استعادة الافتراضي</button></div>
            <div className="mb-5 flex gap-2 overflow-x-auto pb-2">{groups.map(group => <button key={group} type="button" onClick={() => setFilter(group)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${filter === group ? 'bg-[#115a47] text-white' : 'bg-slate-100 text-slate-600'}`}>{group}</button>)}</div>
            <div className="grid gap-3 sm:grid-cols-2">{ordered.map(item => (
              <div key={item.id} className={`flex items-center gap-3 rounded-2xl border p-3 transition ${enabled.has(item.id) ? 'border-emerald-200 bg-[#f6fbf8]' : 'border-slate-200 bg-white'}`}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-xl text-emerald-800 shadow-sm" aria-hidden>{item.icon}</span>
                <div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{item.title}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{item.description}</p></div>
                <div className="flex shrink-0 flex-col items-center gap-1"><button type="button" aria-label={`تفعيل ${item.title}`} aria-pressed={enabled.has(item.id)} onClick={() => toggle(item.id)} className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${enabled.has(item.id) ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500'}`}>{enabled.has(item.id) ? 'مفعّل' : 'إضافة'}</button><div className="flex gap-1"><button type="button" aria-label={`تقديم ${item.title}`} onClick={() => move(item.id, -1)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-200"><ArrowUp size={15} /></button><button type="button" aria-label={`تأخير ${item.title}`} onClick={() => move(item.id, 1)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-200"><ArrowDown size={15} /></button></div></div>
              </div>
            ))}</div>
          </div>
        </section>
        <aside className="space-y-4 lg:sticky lg:top-4">
          <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between gap-2"><div><h2 className="text-lg font-black">معاينة مباشرة</h2><p className="text-xs text-slate-500">مثل بطاقات سميع المصغرة</p></div><button type="button" onClick={() => setRefresh(v => v + 1)} aria-label="تحديث المعاينة" className="rounded-full bg-slate-100 p-2 text-emerald-800"><RefreshCw size={17} /></button></div>
            <div className="max-h-[560px] space-y-3 overflow-y-auto rounded-[30px] bg-[#e6e9e5] p-4">
              {snapshot.widgets.length ? snapshot.widgets.map(item => (
                <div key={item.id} className={`relative overflow-hidden rounded-[24px] p-4 shadow-md ${settings.size === 'large' ? 'min-h-48' : settings.size === 'medium' ? 'min-h-32' : 'min-h-24'}`} style={{ background: THEMES[settings.theme].background, color: THEMES[settings.theme].text }}>
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-bold opacity-85">مصحف سميع</span><span className="text-xl" aria-hidden>{item.icon}</span></div><h3 className="mt-2 text-lg font-black">{item.title}</h3><p className="mt-1 text-sm font-bold" style={{ color: THEMES[settings.theme].muted }}>{item.subtitle}</p>{item.detail && <p className="mt-2 text-[11px] leading-5 opacity-85">{item.detail}</p>}
                  <Link href={item.url} className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold" style={{ color: THEMES[settings.theme].accent }}>فتح القسم <ExternalLink size={12} /></Link>
                  {item.id === 'tasbih' && <div className="mt-3 flex items-center gap-2"><button type="button" onClick={() => { updateTasbih(1); setRefresh(v => v + 1) }} className="rounded-full bg-white/20 px-4 py-2 text-xs font-bold">+ تسبيحة</button><span className="text-[11px]">{getTasbihCount().toLocaleString('ar-EG')}</span></div>}
                </div>
              )) : <p className="rounded-xl bg-white p-4 text-center text-sm font-bold text-slate-600">فعّل ويدجت واحدة على الأقل لعرضها هنا</p>}
            </div>
          </div>
          <div className="rounded-3xl border border-amber-200 bg-[#fffaf0] p-5 text-slate-700"><div className="flex items-center gap-2 font-extrabold text-amber-900"><Info size={18} /> التثبيت على الشاشة الرئيسية</div><p className="mt-3 text-xs leading-7">الصفحة دي بتعمل على الموقع وتطبيق الويب. ويدجت نظام الآيفون والأندرويد تتطلب تثبيت نسخة أصلية وإضافة الملفات المرفقة لمشروعها. التحديث على الويدجت الخارجية يخضع لسياسات النظام.</p><p className="mt-2 text-xs font-semibold">{native ? 'أنت تستخدم جهازًا محمولًا؛ يمكن إضافة الموقع للشاشة الرئيسية كاختصار.' : 'على الكمبيوتر يمكن تجربة كل الخيارات ومزامنة البيانات المحلية.'}</p></div>
          <div className="flex items-center gap-2 rounded-2xl bg-white p-4 text-xs font-bold text-slate-600"><ShieldCheck size={19} className="text-emerald-700" /> بياناتك تبقى على جهازك، ولا تُرسل إلى خادم جديد.</div>
          {notice && <p role="status" className="rounded-xl bg-emerald-100 px-4 py-3 text-xs font-bold text-emerald-900">{notice}</p>}
        </aside>
      </div>
    </main>
  )
}
