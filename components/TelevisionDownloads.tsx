'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download, Tv } from 'lucide-react'
export default function TelevisionDownloads() {
  const [apk, setApk] = useState<string | null>(null), [webos, setWebos] = useState<string | null>(null)
  useEffect(() => { const controller = new AbortController(); void fetch('/api/tv-release', { cache: 'no-store', signal: controller.signal }).then(r => r.json()).then(data => { if (typeof data.apk === 'string') setApk(data.apk); if (typeof data.webos === 'string') setWebos(data.webos) }).catch(() => {}); return () => controller.abort() }, [])
  return <section id="televisions" className="mb-6 rounded-3xl border border-[#d9c39d] bg-white p-5"><h2 className="flex items-center gap-2 font-bold text-[#194f43]"><Tv size={23}/>سميع لشاشات العرض</h2><p className="mt-2 text-xs leading-7 text-slate-600">عرض الكمبيوتر مع تحكم الريموت، وإصدارات خاصة لأنظمة Android TV وGoogle TV وFire TV وLG webOS.</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/?tv=1" className="flex min-h-11 items-center rounded-xl bg-[#194f43] px-4 text-xs font-bold text-white">فتح وضع الشاشة الآن</Link>{apk && <a href={apk} className="flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold"><Download size={16}/>تحميل Android TV APK</a>}{webos && <a href={webos} className="flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold"><Download size={16}/>تحميل LG webOS IPK</a>}<Link href="/tv" className="flex min-h-11 items-center rounded-xl border px-4 text-xs font-bold text-[#194f43]">التوافق وخطوات التشغيل</Link></div>{!apk && <p className="mt-3 text-xs leading-6 text-slate-500">زر تنزيل APK يظهر تلقائيًا بعد بناء النسخة الموقعة ونشرها من إدارة المشروع.</p>}</section>
}
