'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, Monitor, Share2 } from 'lucide-react'
import AndroidAppCard from '@/components/AndroidAppCard'
import WebInstallButton from '@/components/WebInstallButton'
import TelevisionDownloads from '@/components/TelevisionDownloads'
import { parseAppDownloads, type AppDownloads } from '@/lib/app-downloads'

export default function AppDownloadsCard({ detailed = false }: { detailed?: boolean }) {
  const [data, setData] = useState<AppDownloads | null>(null)
  const [notice, setNotice] = useState('')
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const load = () => {
      if (navigator.onLine === false) return
      void fetch('/api/app-downloads', { cache: 'no-store', signal: controller.signal })
        .then(async (response) => { if (!response.ok) throw new Error('Download metadata unavailable'); return response.json() })
        .then((raw) => { if (!controller.signal.aborted) { setData(parseAppDownloads(raw)); setLoaded(true) } })
        .catch(() => { if (!controller.signal.aborted) setLoaded(true) })
    }
    const visible = () => { if (document.visibilityState === 'visible') load() }
    load(); const timer = window.setInterval(visible, 60_000)
    window.addEventListener('online', load); document.addEventListener('visibilitychange', visible)
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('online', load); document.removeEventListener('visibilitychange', visible) }
  }, [])
  async function share() {
    const url = 'https://samee3.vercel.app/downloads'
    try {
      if (navigator.share) await navigator.share({ title: 'تطبيقات مصحف سميع', text: 'حمّل مصحف سميع لأندرويد وويندوز والماك', url })
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); setNotice('نُسخ رابط تحميل تطبيقات سميع.') }
      else setNotice(url)
    } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setNotice(url) }
  }
  const windows = data?.windows.find(item => item.id === 'x64')
  if (!detailed) return <section dir="rtl" aria-label="تثبيت وتحميل مصحف سميع" className="mb-6 rounded-[28px] border border-[#d9c39d] bg-gradient-to-br from-white to-[#f8f1e3] p-5 shadow-sm"><div className="flex items-start gap-3"><span className="rounded-2xl bg-[#194f43] p-3 text-[#f7d992]"><Download size={24}/></span><div><h2 className="font-extrabold text-[#194f43]">سميع معك على كل أجهزتك</h2><p className="mt-1 text-xs leading-6 text-slate-600">ثبّت تطبيق الويب أو اختر نسخة جهازك من صفحة التحميلات.</p></div></div><div className="mt-4 flex flex-wrap gap-2"><WebInstallButton/>{[['android', 'أندرويد'], ['web', 'آيفون وآيباد'], ['windows', 'ويندوز'], ['macos', 'الماك'], ['televisions', 'شاشات العرض']].map(([id, name]) => <Link key={id} href={`/downloads#${id}`} className="flex min-h-11 items-center rounded-xl border border-[#d9c39d] bg-white px-4 text-xs font-bold text-[#194f43]">{name}</Link>)}</div></section>
  return <div aria-label="تحميل تطبيقات مصحف سميع">
    <section id="web" className="mb-6 rounded-3xl border border-[#d9c39d] bg-white p-5"><h2 className="mb-3 font-bold text-[#194f43]">تطبيق الويب للآيفون والآيباد والكمبيوتر</h2><WebInstallButton/><Link href="/notifications" className="mt-3 block min-h-10 text-xs font-bold text-[#194f43]">ضبط الإشعارات والتذكيرات ←</Link></section>
    <div id="android"><AndroidAppCard /></div>
    <section id="windows" aria-label="تطبيق سميع لويندوز" className="mb-6 rounded-3xl border border-[#d9c39d] bg-gradient-to-br from-white to-[#f8f1e3] p-5 shadow-sm">
      <div className="flex items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#194f43] text-[#f7d992]"><Monitor size={25} /></span>
        <div className="min-w-0 flex-1"><h2 className="text-base font-extrabold text-[#194f43]">مصحف سميع لويندوز</h2><p className="mt-1 text-xs leading-6 text-slate-600">ملف تثبيت للكمبيوتر، مع المصحف المحفوظ بالروايات السبع والأذان والتذكيرات.</p></div></div>
      <div className="mt-4 min-w-0 rounded-2xl border border-[#e4d8c1] bg-white p-4">
        <h3 className="text-sm font-bold text-[#194f43]">أجهزة ويندوز بمعالج Intel أو AMD — ‏64 بت</h3>
        <p className="my-2 text-[11px] leading-6 text-slate-500">Windows 10 وWindows 11 · x64{windows ? ` · الإصدار ${windows.versionName} · ${(windows.bytes / 1024 / 1024).toFixed(1)} ميجابايت` : ''}</p>
        {windows?.available && windows.url ? <a href={windows.url} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#194f43] px-3 py-3 text-xs font-bold text-white"><Download size={17} />تحميل تطبيق ويندوز EXE</a>
          : <span role="status" className="flex min-h-11 items-center justify-center rounded-xl bg-slate-100 px-3 py-3 text-xs font-bold text-slate-500">{loaded ? 'التحميل متاح قريبًا' : 'جارٍ التحقق من النسخة…'}</span>}
      </div>
      <p className="mt-3 text-xs leading-7 text-slate-600">بعد التنزيل، افتح ملف Setup.exe وأكمل التثبيت. كل نسخة مخصصة لنظام تشغيلها.</p>
      {detailed && <div className="mt-3 space-y-2 rounded-2xl bg-white/80 p-4 text-xs leading-7 text-slate-600"><p>تذكيرات ويندوز تستمر عند إغلاق النافذة إلى أيقونة سميع بجانب الساعة. اختيار «إنهاء سميع» يوقفها، ولا يوقظ التطبيق جهازًا نائمًا.</p><p>فعّل التذكيرات من داخل التطبيق واسمح بإشعارات سميع من إعدادات Windows. يمكنك تشغيله تلقائيًا عند تسجيل الدخول.</p><p>هذا الإصدار غير موقّع بشهادة ناشر موثّق حاليًا؛ قد يعرض Windows تنبيهًا عند تشغيل الملف. تحقّق من مصدر التنزيل.</p></div>}
    </section>
    <section id="macos" aria-label="تطبيق سميع للماك" className="mb-6 rounded-3xl border border-[#d9c39d] bg-gradient-to-br from-white to-[#f8f1e3] p-5 shadow-sm">
      <div className="flex items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#194f43] text-[#f7d992]"><Monitor size={25} /></span>
        <div className="min-w-0 flex-1"><h2 className="text-base font-extrabold text-[#194f43]">مصحف سميع على الماك</h2><p className="mt-1 text-xs leading-6 text-slate-600">لأجهزة Apple Mac بنظام macOS. اختَر نوع معالج الماك.</p></div></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(['apple-silicon', 'intel'] as const).map((id) => {
          const file = data?.macos.find((item) => item.id === id)
          const label = id === 'apple-silicon' ? 'Mac Apple Silicon — M1 وما بعدها' : 'Mac Intel — لأجهزة الماك بمعالج Intel'
          return <div key={id} className="min-w-0 rounded-2xl border border-[#e4d8c1] bg-white p-4"><h3 className="text-sm font-bold text-[#194f43]" dir="auto">{label}</h3>
            <p className="my-2 text-[11px] leading-6 text-slate-500">macOS {file?.minimumOS || '13.0'} أو أحدث{file ? ` · الإصدار ${file.versionName} · ${(file.bytes / 1024 / 1024).toFixed(1)} ميجابايت` : ''}</p>
            {file?.available && file.url ? <a href={file.url} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#194f43] px-3 py-3 text-xs font-bold text-white"><Download size={17} />{id === 'apple-silicon' ? 'تحميل نسخة Mac Apple Silicon' : 'تحميل نسخة Mac Intel'}</a>
              : <span role="status" className="flex min-h-11 items-center justify-center rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-500">{loaded ? 'التحميل متاح قريبًا' : 'جارٍ التحقق من النسخة…'}</span>}
          </div>
        })}
      </div>
      <p className="mt-3 text-xs leading-7 text-slate-600">لمعرفة المعالج: قائمة Apple ← حول هذا الـMac. بعد التحميل، فك الضغط وانقل Samee3.app إلى مجلد التطبيقات.</p>
      {detailed && <div className="mt-3 space-y-2 rounded-2xl bg-white/80 p-4 text-xs leading-7 text-slate-600"><p>نسخة الماك بتوقيع محلي وغير معتمدة من Apple. إذا منع النظام فتحها، راجع «الخصوصية والأمن» ثم «فتح على أي حال» بعد التحقق من مصدر الملف.</p><p>تذكيرات الماك تعمل أثناء بقاء سميع شغالًا، حتى عند إخفاء النافذة. إنهاء التطبيق بالكامل يوقف تذكيراته، ولا يوقظ الجهاز من النوم.</p><p>أندرويد: افتح ملف APK بعد التنزيل وأكمل موافقة النظام على التثبيت، ثم فعّل التذكيرات من داخل سميع.</p></div>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => void share()} className="flex min-h-10 items-center gap-2 rounded-xl border border-[#d9c39d] bg-white px-3 text-xs font-bold text-[#194f43]"><Share2 size={15} />مشاركة صفحة التحميل</button>{!detailed && <Link href="/downloads" className="text-xs font-bold text-[#194f43]">كل النسخ وخطوات التثبيت ←</Link>}</div>
      {notice && <p role="status" className="mt-2 break-words text-xs leading-6 text-[#194f43]">{notice}</p>}
    </section>
    <TelevisionDownloads />
  </div>
}
