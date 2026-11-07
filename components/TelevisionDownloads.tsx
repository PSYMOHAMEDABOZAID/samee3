'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, Tv } from 'lucide-react'

/** The stable download links are always rendered. API metadata is enhancement only. */
export default function TelevisionDownloads() {
  const [apk, setApk] = useState<string | null>(null)
  const [webos, setWebos] = useState<string | null>(null)

  useEffect(() => {
    // AbortController may be missing on older browsers; the fallback links do not rely on this fetch.
    if (typeof window === 'undefined' || typeof window.fetch !== 'function' || typeof window.AbortController === 'undefined') return
    const controller = new AbortController()
    void fetch('/api/tv-release', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : {})
      .then((data: { apk?: unknown; webos?: unknown }) => {
        if (!controller.signal.aborted) {
          if (typeof data.apk === 'string') setApk(data.apk)
          if (typeof data.webos === 'string') setWebos(data.webos)
        }
      }).catch(() => undefined)
    return () => controller.abort()
  }, [])

  return <section id="televisions" className="mb-6 rounded-3xl border border-[#d9c39d] bg-white p-5">
    <h2 className="flex items-center gap-2 font-bold text-[#194f43]"><Tv size={23} />سميع لشاشات العرض</h2>
    <p className="mt-2 text-xs leading-7 text-slate-600">عرض الكمبيوتر مع تحكم الريموت، وإصدارات خاصة لأنظمة Android TV وGoogle TV وFire TV وLG webOS.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <Link href="/?tv=1" className="flex min-h-11 items-center rounded-xl bg-[#194f43] px-4 text-xs font-bold text-white">فتح وضع الشاشة الآن</Link>
      <a href={apk || '/api/legacy-download?kind=tv'} className="flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold"><Download size={16} />تحميل Android TV APK</a>
      <a href={webos || '/api/legacy-download?kind=webos'} className="flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold"><Download size={16} />تحميل LG webOS IPK</a>
      <Link href="/tv" className="flex min-h-11 items-center rounded-xl border px-4 text-xs font-bold text-[#194f43]">التوافق وخطوات التشغيل</Link>
      <a href="/legacy/index.html" className="flex min-h-11 items-center rounded-xl border px-4 text-xs font-bold text-[#194f43]">تشغيل النسخة الخفيفة</a>
    </div>
    <p className="mt-3 text-xs leading-6 text-slate-500">روابط تنزيل عادية لا تحتاج JavaScript؛ إذا لم تُنشر نسخة التثبيت بعد ستظهر رسالة بدل فشل صامت.</p>
  </section>
}
