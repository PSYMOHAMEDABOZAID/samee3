'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Loader2, Pause, Play, SkipForward, X } from 'lucide-react'
import { appAudio, useAppAudio } from '@/lib/app-audio'

export default function PersistentAudioPlayer() {
  const playback = useAppAudio()
  const pathname = usePathname()
  const params = useSearchParams()
  const track = playback.queue[playback.index]
  const sameAdhkar = pathname === '/adhkar/read' &&
    playback.contextKey === `samee3_adhkar_progress_v2_${Number(params.get('categoryId') || 0) || params.get('type') || 'morning'}`
  if (!track || (playback.scope === 'library' && pathname === '/audio') || (playback.scope === 'adhkar' && sameAdhkar) || (playback.scope === 'riwayat' && pathname === '/audio/alafasy-riwayat')) return null
  return <aside dir="rtl" aria-label="مشغل سميع المستمر" className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[70] mx-auto flex max-w-xl items-center gap-2 rounded-2xl border border-[#d9c39d] bg-[#194f43] p-3 text-white shadow-xl">
    <Link href={playback.href} className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{track.title}</p><p className="truncate text-xs opacity-80">{playback.error || track.subtitle}</p></Link>
    <button type="button" aria-label={playback.loading ? 'إيقاف تحميل التسجيل' : playback.playing ? 'إيقاف الصوت مؤقتًا' : 'استكمال الصوت'} onClick={() => appAudio.toggle()} className="rounded-full p-3">{playback.loading ? <Loader2 size={20} className="animate-spin"/> : playback.playing ? <Pause size={20}/> : <Play size={20}/>}</button>
    {playback.queue.length > 1 && <button type="button" aria-label="التسجيل التالي" onClick={() => appAudio.next(1)} className="p-2"><SkipForward size={19}/></button>}
    <button type="button" aria-label="إغلاق المشغل" onClick={() => appAudio.stop()} className="p-2"><X size={18}/></button>
  </aside>
}
