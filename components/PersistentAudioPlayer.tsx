'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Loader2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { appAudio, useAppAudio } from '@/lib/app-audio'

type MushafAudio = HTMLAudioElement & {
  __samee3Continue?: boolean
  __samee3Switching?: boolean
  __samee3Serial?: number
  __samee3Surah?: number
  __samee3ReciterId?: number
  __samee3ReciterName?: string
}
type MushafView = { src: string; playing: boolean; surah: number; reciter: string }

function mushafElement(): MushafAudio | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { __samee3PersistentAudio?: MushafAudio }).__samee3PersistentAudio || null
}

/**
 * A global, lightweight controller for three independent players:
 * the native mushaf Audio element, and the persistent adhkar/library queues.
 * No mushaf/Alafasy source URL, reciter, timing or queue is altered.
 */
export default function PersistentAudioPlayer() {
  const playback = useAppAudio()
  const pathname = usePathname() || '/'
  const params = useSearchParams()
  const track = playback.queue[playback.index]
  const [mushaf, setMushaf] = useState<MushafView | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let attached: MushafAudio | null = null
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined
    let recoveryUrl = ''
    let recoveryCount = 0
    const onTemporaryError = () => {
      const element = attached
      if (!element || element.__samee3ReciterId === 9000123 ||
        element.__samee3Continue !== true || element.__samee3Switching ||
        element.error?.code !== 2 || navigator.onLine === false) return
      const url = element.currentSrc || element.src
      if (!url || url.startsWith('blob:')) return
      if (url !== recoveryUrl) { recoveryUrl = url; recoveryCount = 0 }
      if (recoveryCount >= 2 || recoveryTimer) return
      recoveryCount += 1
      recoveryTimer = window.setTimeout(() => {
        recoveryTimer = undefined
        if (mushafElement() !== element || element.__samee3Continue !== true ||
          element.__samee3Switching || element.ended ||
          (element.currentSrc || element.src) !== url || navigator.onLine === false) return
        const position = Number.isFinite(element.currentTime) ? element.currentTime : 0
        try {
          if (position > 0) element.addEventListener('loadedmetadata', () => {
            if (Number.isFinite(element.duration) && position < element.duration - 1) {
              try { element.currentTime = position } catch { /* source is not seekable */ }
            }
          }, { once: true })
          element.load()
          void element.play().catch(() => {
            setMessage('تعذر الاستكمال تلقائيًا. اضغط تشغيل من المصحف.')
          })
        } catch { setMessage('تعذر استعادة التلاوة. افتح المصحف للمحاولة مجددًا.') }
      }, recoveryCount * 3000)
    }
    const snapshot = () => {
      const element = mushafElement()
      if (element !== attached) {
        attached?.removeEventListener('play', snapshot)
        attached?.removeEventListener('pause', snapshot)
        attached?.removeEventListener('ended', snapshot)
        attached?.removeEventListener('error', snapshot)
        attached?.removeEventListener('error', onTemporaryError)
        if (recoveryTimer) clearTimeout(recoveryTimer)
        recoveryTimer = undefined
        recoveryUrl = ''
        recoveryCount = 0
        attached = element
        attached?.addEventListener('play', snapshot)
        attached?.addEventListener('pause', snapshot)
        attached?.addEventListener('ended', snapshot)
        attached?.addEventListener('error', snapshot)
        attached?.addEventListener('error', onTemporaryError)
      }
      if (!element || !element.getAttribute('src')) {
        setMushaf(previous => previous === null ? previous : null)
        return
      }
      const playing = !element.paused && !element.ended
      const next = {
        src: element.getAttribute('src') || '',
        playing,
        surah: Number(element.__samee3Surah || 0),
        reciter: element.__samee3ReciterName || 'تلاوة المصحف',
      }
      // Keep React updates low, even when a long recording is playing.
      setMushaf(previous => previous &&
        previous.src === next.src && previous.playing === next.playing &&
        previous.surah === next.surah && previous.reciter === next.reciter
        ? previous : next)
      if (playing) {
        // Prevent two unrelated players from playing simultaneously.
        // Exclude 'riwayat' entirely: existing Alafasy behavior is untouched.
        const current = appAudio.getSnapshot()
        if (current.scope === 'library' || current.scope === 'adhkar') {
          const other = appAudio.element()
          if (other && !other.paused) appAudio.stop(current.scope)
        }
      }
    }
    snapshot()
    const interval = window.setInterval(snapshot, 1800)
    document.addEventListener('visibilitychange', snapshot)
    window.addEventListener('pageshow', snapshot)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', snapshot)
      window.removeEventListener('pageshow', snapshot)
      attached?.removeEventListener('play', snapshot)
      attached?.removeEventListener('pause', snapshot)
      attached?.removeEventListener('ended', snapshot)
      attached?.removeEventListener('error', snapshot)
      attached?.removeEventListener('error', onTemporaryError)
      if (recoveryTimer) clearTimeout(recoveryTimer)
    }
  }, [])

  const sameAdhkar = pathname === '/adhkar/read' &&
    playback.contextKey === `samee3_adhkar_progress_v2_${Number(params.get('categoryId') || 0) || params.get('type') || 'morning'}`
  const onMushafPage = pathname === '/mushaf' || pathname.startsWith('/mushaf/')
  const showMushaf = Boolean(
    mushaf?.src && !onMushafPage &&
    (mushaf.playing || !track || !playback.playing && !playback.loading)
  )

  const stopMushaf = () => {
    const audio = mushafElement()
    if (!audio) return
    audio.__samee3Continue = false
    audio.__samee3Switching = false
    audio.__samee3Serial = Number(audio.__samee3Serial || 0) + 1
    audio.pause()
    setMushaf(previous => previous ? { ...previous, playing: false } : null)
  }
  const toggleMushaf = () => {
    const audio = mushafElement()
    if (!audio?.getAttribute('src')) return
    setMessage('')
    if (!audio.paused) { stopMushaf(); return }
    // A direct user gesture is needed for Safari/iOS audio activation.
    audio.__samee3Continue = true
    void audio.play().catch(() => {
      audio.__samee3Continue = false
      setMessage('تعذر استكمال التلاوة. افتح المصحف واضغط تشغيل.')
    })
  }

  if (showMushaf && mushaf) return (
    <aside dir="rtl" aria-label="مشغل تلاوة المصحف المستمر" className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[70] mx-auto flex max-w-xl items-center gap-2 rounded-2xl border border-[#d9c39d] bg-[#194f43] p-3 text-white shadow-xl">
      <Link href="/mushaf" className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{mushaf.surah ? `القرآن الكريم · سورة ${mushaf.surah}` : 'تلاوة المصحف'}</p>
        <p className="truncate text-xs opacity-80">{message || mushaf.reciter}</p>
      </Link>
      <button type="button" aria-label={mushaf.playing ? 'إيقاف التلاوة مؤقتًا' : 'استكمال التلاوة'} onClick={toggleMushaf} className="rounded-full p-3">{mushaf.playing ? <Pause size={20}/> : <Play size={20}/>}</button>
      <button type="button" aria-label="إيقاف وإغلاق مشغل المصحف" onClick={stopMushaf} className="p-2"><X size={18}/></button>
    </aside>
  )

  if (!track || (playback.scope === 'library' && pathname === '/audio') ||
    (playback.scope === 'adhkar' && sameAdhkar) ||
    (playback.scope === 'riwayat' && pathname === '/audio/alafasy-riwayat')) return null

  return (
    <aside dir="rtl" aria-label="مشغل سميع المستمر" className="fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[70] mx-auto flex max-w-xl items-center gap-2 rounded-2xl border border-[#d9c39d] bg-[#194f43] p-3 text-white shadow-xl">
      <Link href={playback.href || '/audio'} className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{track.title}</p>
        <p className="truncate text-xs opacity-80">{playback.error || track.subtitle}</p>
      </Link>
      <button type="button" aria-label={playback.loading ? 'إيقاف تحميل التسجيل' : playback.playing ? 'إيقاف الصوت مؤقتًا' : 'استكمال الصوت'} onClick={() => appAudio.toggle()} className="rounded-full p-3">{playback.loading ? <Loader2 size={20} className="animate-spin"/> : playback.playing ? <Pause size={20}/> : <Play size={20}/>}</button>
      {playback.queue.length > 1 && <>
        <button type="button" aria-label="التسجيل السابق" onClick={() => appAudio.next(-1)} className="p-2"><SkipBack size={19}/></button>
        <button type="button" aria-label="التسجيل التالي" onClick={() => appAudio.next(1)} className="p-2"><SkipForward size={19}/></button>
      </>}
      <button type="button" aria-label="إغلاق المشغل" onClick={() => appAudio.stop()} className="p-2"><X size={18}/></button>
    </aside>
  )
}
