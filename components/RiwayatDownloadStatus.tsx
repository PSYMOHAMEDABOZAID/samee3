'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { Download, X } from 'lucide-react'
import { cancelRiwayatDownload, clearRiwayatDownload, downloadSnapshot, restoreRiwayatDownload, serverDownloadSnapshot, subscribeDownload } from '@/lib/riwayat-download'
export default function RiwayatDownloadStatus() {
  const job = useSyncExternalStore(subscribeDownload, downloadSnapshot, serverDownloadSnapshot)
  useEffect(() => { void restoreRiwayatDownload() }, [])
  if (!job) return null
  const running = job.phase === 'preparing' || job.phase === 'downloading'
  return <aside dir="rtl" aria-label="تنزيل مصحف العفاسي" className="fixed bottom-24 left-3 right-3 z-[125] mx-auto max-w-lg rounded-2xl border border-emerald-200 bg-white p-4 text-slate-800 shadow-xl sm:left-6 sm:right-auto">
    <div className="flex items-center gap-2"><Download size={20} className="text-emerald-700"/><strong className="min-w-0 flex-1 text-sm">{job.title}</strong><button type="button" aria-label={running ? 'إيقاف التنزيل' : 'إغلاق شريط التنزيل'} onClick={() => running ? cancelRiwayatDownload() : void clearRiwayatDownload()} className="rounded-lg p-2"><X size={18}/></button></div>
    <p role={job.phase === 'error' ? 'alert' : 'status'} className="my-2 text-xs leading-6">{job.message}</p>
    {job.phase !== 'error' && <><progress aria-label="تقدم تحميل المصحف" max={100} value={job.percent} className="h-2 w-full accent-emerald-700"/><div className="mt-1 flex justify-between text-xs text-slate-500"><span>{job.completed} / {job.total || '—'} سورة</span><span>{(job.bytes / 1024 / 1024).toFixed(1)} MB • {job.percent}٪</span></div></>}
    {job.phase === 'ready' && job.archive && <a download={job.archive.filename} href={`/__samee3_downloads/${job.archive.id}/${encodeURIComponent(job.archive.filename)}`} className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 p-3 text-sm font-bold text-white"><Download size={17}/>حفظ ZIP على الجهاز</a>}
    {running && <p className="mt-2 text-[11px] text-slate-500">اترك التطبيق مفتوحًا أثناء التحميل. يمكنك التنقل بين أقسام سميع.</p>}
  </aside>
}
