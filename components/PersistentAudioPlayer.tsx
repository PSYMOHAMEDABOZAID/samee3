'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Headphones, Loader2, MoonStar, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
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
  const track = playback.queue[playback.index]
  const [mushaf, setMushaf] = useState<MushafView | null>(null)
  const [message, setMessage] = useState('')
  const [hiddenSession, setHiddenSession] = useState('')
  const [minimized, setMinimized] = useState(false)
  const [idleExpanded, setIdleExpanded] = useState(false)
  const [timerUntil, setTimerUntil] = useState<number | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    const readTimer = () => {
      setNow(Date.now())
      try {
        const value: unknown = JSON.parse(localStorage.getItem('samee3_sleep_timer_v1') || 'null')
        const until = value && typeof value === 'object' ? (value as { until?: unknown }).until : null
        setTimerUntil(typeof until === 'number' && Number.isFinite(until) && until > Date.now() ? until : null)
      } catch { setTimerUntil(null) }
    }
    readTimer()
    const interval = window.setInterval(readTimer, 10000)
    window.addEventListener('samee3:sleep-timer-changed', readTimer)
    window.addEventListener('storage', readTimer)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('samee3:sleep-timer-changed', readTimer)
      window.removeEventListener('storage', readTimer)
    }
  }, [])

  useEffect(() => {
    let attached: MushafAudio | null = null
    let recoveryTimer: number | undefined
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

  // New playback started after closing the old panel: show the controls again.
  useEffect(() => {
    if (mushaf?.playing || playback.playing) setHiddenSession('')
  }, [mushaf?.playing, playback.playing])

  const onReadingPage = /^\/(mushaf|audio|adhkar)(?:\/|$)/.test(pathname)
  const onOwnPage = pathname === '/mushaf' || pathname.startsWith('/mushaf/') ||
    (playback.scope === 'library' && pathname === '/audio') ||
    (playback.scope === 'adhkar' && pathname === '/adhkar/read') ||
    (playback.scope === 'riwayat' && pathname === '/audio/alafasy-riwayat')
  // Do not duplicate the Alafasy player's built-in controls on its own page.
  const protectedRiwayatPage = playback.scope === 'riwayat' && pathname === '/audio/alafasy-riwayat'
  const visibleTrack = protectedRiwayatPage ? undefined : track
  const showMushaf = !protectedRiwayatPage && Boolean(mushaf?.src && (
    mushaf.playing || !visibleTrack || (!playback.playing && !playback.loading)
  ))
  const session = showMushaf && mushaf ? `mushaf:${mushaf.src}`
    : visibleTrack ? `track:${playback.scope}:${visibleTrack.url}:${playback.index}`
    : `idle:${pathname}`
  const idle = !showMushaf && !visibleTrack
  const left = timerUntil === null ? 0 : Math.max(0, timerUntil - now)
  const timerLabel = timerUntil !== null && left > 0
    ? `${Math.ceil(left / 60000)} د` : 'مؤقت'
  const openTimer = () => window.dispatchEvent(new Event('samee3:open-sleep-timer'))

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
    // This user gesture is needed by Safari/iOS to resume playback.
    audio.__samee3Continue = true
    void audio.play().catch(() => {
      audio.__samee3Continue = false
      setMessage('تعذر استكمال التلاوة. افتح المصحف واضغط تشغيل.')
    })
  }
  const closePlayer = () => {
    setHiddenSession(session)
    setMinimized(false)
    setIdleExpanded(false)
    if (showMushaf) stopMushaf()
    else if (visibleTrack) appAudio.stop()
  }

  if ((!onReadingPage && idle) || hiddenSession === session) return null

  // On a reading page without audio, use a small player launcher rather than
  // an independent floating sleep-timer button over Qur'an text.
  if (idle && !idleExpanded) return (
    <button type="button" onClick={() => setIdleExpanded(true)}
      aria-label="فتح أدوات مشغل سميع ومؤقت القراءة"
      title="أدوات مشغل سميع"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-[68] flex h-10 w-10 items-center justify-center rounded-full border border-[#d9c39d] bg-[#194f43] text-white shadow-lg">
      <Headphones size={19} aria-hidden="true" />
    </button>
  )

  if (!idle && (minimized || (onOwnPage && !idleExpanded))) return (
    <button type="button" onClick={() => { setMinimized(false); setIdleExpanded(true) }}
      aria-label="توسيع مشغل سميع"
      title="توسيع مشغل سميع"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 z-[68] flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-[#d9c39d] bg-[#194f43] px-3 text-white shadow-lg">
      <Headphones size={19} aria-hidden="true" />
      {timerUntil !== null && left > 0 && <span className="text-xs font-bold" dir="ltr">{timerLabel}</span>}
    </button>
  )

  return (
    <aside dir="rtl" aria-label="مشغل سميع ومؤقت القراءة"
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[68] mx-auto max-w-xl rounded-2xl border border-[#d9c39d] bg-[#194f43]/95 px-2.5 py-2 text-white shadow-xl backdrop-blur-md">
      <div className="flex min-h-10 items-center gap-1.5">
        {showMushaf && mushaf ? (
          <Link href="/mushaf" className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-bold">{mushaf.surah ? `تلاوة المصحف · سورة ${mushaf.surah}` : 'تلاوة المصحف'}</p>
            <p className="truncate text-[11px] opacity-80">{message || mushaf.reciter}</p>
          </Link>
        ) : visibleTrack ? (
          <Link href={playback.href || '/audio'} className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-bold">{visibleTrack.title}</p>
            <p className="truncate text-[11px] opacity-80">{playback.error || visibleTrack.subtitle}</p>
          </Link>
        ) : <p className="min-w-0 flex-1 px-1 text-sm font-bold">أدوات القراءة والاستماع</p>}

        {!idle && <button type="button"
          aria-label={showMushaf ? (mushaf?.playing ? 'إيقاف التلاوة مؤقتًا' : 'استكمال التلاوة') : (playback.playing ? 'إيقاف مؤقت' : 'تشغيل')}
          onClick={showMushaf ? toggleMushaf : () => appAudio.toggle()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15">
          {!showMushaf && playback.loading ? <Loader2 size={20} className="animate-spin" />
            : (showMushaf ? mushaf?.playing : playback.playing) ? <Pause size={20} /> : <Play size={20} />}
        </button>}
        {!idle && !showMushaf && playback.queue.length > 1 && <>
          <button type="button" aria-label="السابق" onClick={() => appAudio.next(-1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"><SkipBack size={18}/></button>
          <button type="button" aria-label="التالي" onClick={() => appAudio.next(1)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"><SkipForward size={18}/></button>
        </>}
        <button type="button" onClick={openTimer}
          aria-label="ضبط مؤقت الإيقاف التلقائي"
          title="مؤقت القراءة"
          className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-white/25 px-2 text-xs font-bold">
          <MoonStar size={17} aria-hidden="true" />
          <span>{timerLabel}</span>
        </button>
        {!idle && <button type="button" onClick={() => setMinimized(true)} aria-label="تصغير المشغل" title="تصغير المشغل" className="flex h-9 w-8 shrink-0 items-center justify-center"><ChevronDown size={18}/></button>}
        <button type="button" onClick={closePlayer} aria-label="إغلاق المشغل" title="إغلاق المشغل وإيقاف الصوت" className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-white/85"><X size={19}/></button>
      </div>
    </aside>
  )
}