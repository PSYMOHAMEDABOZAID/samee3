'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Headphones, Loader2, MoonStar, Pause, Play, SkipBack, SkipForward, Square, Volume2, X } from 'lucide-react'
import { appAudio, useAppAudio } from '@/lib/app-audio'

type MushafAudio = HTMLAudioElement & {
  __samee3Continue?: boolean
  __samee3Switching?: boolean
  __samee3Serial?: number
  __samee3Surah?: number
  __samee3ReciterId?: number
  __samee3ReciterName?: string
}
type MushafView = { src: string; playing: boolean; surah: number; reciter: string; position: number; duration: number }

function mushafElement(): MushafAudio | null {
  if (typeof window === 'undefined') return null
  return (window as Window & { __samee3PersistentAudio?: MushafAudio }).__samee3PersistentAudio || null
}

/**
 * A global, lightweight controller for three independent players:
 * the native mushaf Audio element, and the persistent adhkar/library queues.
 * No mushaf/Alafasy source URL, reciter, timing or queue is altered.
 */
const SURAH_NAMES = [
  'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام',
  'الأعراف', 'الأنفال', 'التوبة', 'يونس', 'هود', 'يوسف', 'الرعد',
  'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه',
  'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء',
  'النمل', 'القصص', 'العنكبوت', 'الروم', 'لقمان', 'السجدة',
  'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر',
  'غافر', 'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية',
  'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق', 'الذاريات',
  'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد',
  'المجادلة', 'الحشر', 'الممتحنة', 'الصف', 'الجمعة', 'المنافقون',
  'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة',
  'المعارج', 'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة',
  'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس', 'التكوير',
  'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق',
  'الأعلى', 'الغاشية', 'الفجر', 'البلد', 'الشمس', 'الليل',
  'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة',
  'الزلزلة', 'العاديات', 'القارعة', 'التكاثر', 'العصر',
  'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون',
  'النصر', 'المسد', 'الإخلاص', 'الفلق', 'الناس',
] as const

export default function PersistentAudioPlayer() {
  const playback = useAppAudio()
  const pathname = usePathname() || '/'
  const track = playback.queue[playback.index]
  const [mushaf, setMushaf] = useState<MushafView | null>(null)
  const [message, setMessage] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [mushafExpanded, setMushafExpanded] = useState(false)
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
        position: Number.isFinite(element.currentTime) ? Math.max(0, element.currentTime) : 0,
        duration: Number.isFinite(element.duration) ? Math.max(0, element.duration) : 0,
      }
      // Keep React updates low, even when a long recording is playing.
      setMushaf(previous => previous &&
        previous.src === next.src && previous.playing === next.playing &&
        previous.surah === next.surah && previous.reciter === next.reciter &&
        Math.floor(previous.position) === Math.floor(next.position) &&
        Math.floor(previous.duration) === Math.floor(next.duration)
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

  // The same persistent widget is used throughout the site. Inside the Mushaf
  // it starts as a small icon in the unused lower-right area, not on the verses.
  const isMushafPage = pathname === '/mushaf' || pathname.startsWith('/mushaf/')
  const isReadingPage = /^\/(mushaf|adhkar|audio)(?:\/|$)/.test(pathname)

  useEffect(() => {
    if (isMushafPage) setMushafExpanded(false)
  }, [isMushafPage])

  // Closing hides the widget for this route without restarting playback.
  // Starting actual playback again (or entering another page) makes it accessible.
  useEffect(() => {
    if (mushaf?.playing || playback.playing) setDismissed(false)
  }, [mushaf?.playing, playback.playing])
  useEffect(() => { setDismissed(false) }, [pathname])

  // If both engines happen to have a track, give priority to the one playing.
  const showMushaf = Boolean(mushaf?.src && (
    mushaf.playing || !track || (!playback.playing && !playback.loading)
  ))
  const playing = showMushaf ? Boolean(mushaf?.playing) : playback.playing
  const loading = !showMushaf && playback.loading
  const active = showMushaf || Boolean(track)
  const section = showMushaf ? 'المصحف' : playback.scope === 'adhkar' ? 'الأذكار' :
    playback.scope === 'riwayat' ? 'روايات القرآن' : 'المكتبة الصوتية'
  const displayTitle = showMushaf
    ? (mushaf?.surah && SURAH_NAMES[mushaf.surah - 1]
      ? `سورة ${SURAH_NAMES[mushaf.surah - 1]}` : 'تلاوة القرآن الكريم')
    : (track?.title || 'مشغل سميع')
  const displaySubtitle = showMushaf ? (message || mushaf?.reciter || 'القرآن الكريم') :
    (playback.error || track?.subtitle || 'المصحف · الأذكار · المكتبة الصوتية')
  const destination = showMushaf ? '/mushaf' : (playback.href || '/audio')
  const position = showMushaf ? (mushaf?.position || 0) : playback.position
  const duration = showMushaf ? (mushaf?.duration || 0) : playback.duration
  const timeRemaining = timerUntil === null ? 0 : Math.max(0, timerUntil - now)
  const timerText = timeRemaining > 0 ? `${Math.ceil(timeRemaining / 60000)} د` : 'المؤقت'
  const isCompact = collapsed || (isMushafPage && !mushafExpanded)
  const canShow = active || isReadingPage || timeRemaining > 0

  const stopMushaf = () => {
    const audio = mushafElement()
    if (!audio) return
    // Respect the existing Quran auto-next and user-stop safety contract.
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
    // iOS requires user interaction to resume a suspended Audio element.
    audio.__samee3Continue = true
    void audio.play().catch(() => {
      audio.__samee3Continue = false
      setMessage('تعذر استكمال التلاوة. افتح المصحف واضغط تشغيل.')
    })
  }
  const toggleAudio = () => {
    if (showMushaf) toggleMushaf()
    else if (track) appAudio.toggle()
  }
  const stopAudio = () => {
    if (showMushaf) stopMushaf()
    else if (track) appAudio.stop()
  }
  const closePlayer = () => {
    setDismissed(true)
    setCollapsed(false)
    setMushafExpanded(false)
    stopAudio()
  }
  const expandPlayer = () => {
    setCollapsed(false)
    if (isMushafPage) setMushafExpanded(true)
  }
  const minimizePlayer = () => {
    if (isMushafPage) setMushafExpanded(false)
    else setCollapsed(true)
  }
  const seekAudio = (seconds: number) => {
    if (!Number.isFinite(seconds) || duration <= 0) return
    if (!showMushaf) { appAudio.seek(seconds); return }
    const audio = mushafElement()
    if (!audio || !Number.isFinite(audio.duration)) return
    try { audio.currentTime = Math.max(0, Math.min(seconds, audio.duration)) } catch { /* not seekable */ }
  }
  const formatSeconds = (value: number) => {
    const n = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
  }
  const openTimer = () => window.dispatchEvent(new Event('samee3:open-sleep-timer'))

  if (!canShow || dismissed) return null

  if (isCompact) {
    return (
      <button type="button"
        onClick={expandPlayer}
        aria-label={active ? 'تكبير مشغل سميع وعرض التفاصيل' : 'فتح مشغل سميع ومؤقت القراءة'}
        title="مشغل سميع — اضغط للتكبير"
        dir="rtl"
        className={`fixed right-3 z-[88] flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-full border border-[#dfc99d] bg-[#fffdf8] px-3 text-[#15586e] shadow-[0_7px_24px_rgba(20,64,62,0.2)] transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15586e] ${
          isMushafPage
            ? 'bottom-[calc(3.5rem+env(safe-area-inset-bottom))]'
            : 'bottom-[calc(6.7rem+env(safe-area-inset-bottom))]'
        }`}
      >
        <Headphones size={22} strokeWidth={2} aria-hidden="true" />
        {timeRemaining > 0 && <span className="text-[11px] font-extrabold" dir="ltr">{timerText}</span>}
        {active && playing && <span aria-hidden="true" className="absolute -left-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#2b9a76]" />}
      </button>
    )
  }

  return (
    <aside
      dir="rtl"
      aria-label="مشغل سميع الموحد ومؤقت القراءة"
      className={`fixed left-3 right-3 z-[88] mx-auto w-[calc(100%-24px)] max-w-[540px] overflow-hidden rounded-[24px] border border-[#e3cea7] bg-[#fffdf9]/[0.98] text-[#153f48] shadow-[0_12px_35px_rgba(12,49,63,0.19)] backdrop-blur-xl ${
        isMushafPage
          ? 'bottom-[calc(3.6rem+env(safe-area-inset-bottom))]'
          : 'bottom-[calc(6.7rem+env(safe-area-inset-bottom))]'
      }`}
    >
      <div className="flex min-h-[65px] items-center gap-2 px-3 pt-2.5 pb-2">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#f5ead4] text-[#9f7635]">
          <Volume2 size={22} />
        </span>

        {active ? (
          <Link href={destination} className="min-w-0 flex-1" aria-label={`العودة إلى ${section}`}>
            <p className="truncate text-[13px] font-extrabold leading-6">{displayTitle}</p>
            <p className="truncate text-[11px] font-medium text-slate-500">{displaySubtitle}</p>
          </Link>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-extrabold">مشغل سميع</p>
            <p className="truncate text-[11px] text-slate-500">المصحف والأذكار والمكتبة الصوتية</p>
          </div>
        )}

        {active && <>
          <button type="button" onClick={toggleAudio}
            aria-label={playing || loading ? 'إيقاف الصوت مؤقتًا' : 'استكمال التشغيل'}
            title={playing || loading ? 'إيقاف مؤقت' : 'تشغيل'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#15586e] text-white transition active:scale-95"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button type="button" onClick={stopAudio}
            aria-label="إيقاف الصوت" title="إيقاف الصوت"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border border-[#edd6d0] bg-[#fff4f0] text-[#a44633] transition active:scale-95"
          >
            <Square size={15} fill="currentColor" />
          </button>
        </>}

        <button type="button" onClick={minimizePlayer} aria-label="تصغير المشغل" title="تصغير المشغل"
          className="flex h-9 w-8 shrink-0 items-center justify-center rounded-xl text-[#92754a] transition hover:bg-[#f6efdf]">
          <ChevronDown size={19} />
        </button>
        <button type="button" onClick={closePlayer} aria-label="إغلاق المشغل وإيقاف الصوت" title="إغلاق المشغل"
          className="flex h-9 w-8 shrink-0 items-center justify-center rounded-xl text-[#8b6a50] transition hover:bg-[#fff0e8]">
          <X size={18} />
        </button>
      </div>

      {active && <div className="flex items-center gap-2 border-t border-[#f0e6d4] px-3 pt-2.5 text-[11px] font-medium text-[#71808a]" dir="ltr">
        <span className="w-10 text-center tabular-nums">{formatSeconds(position)}</span>
        <input type="range" min={0} max={Math.max(1, duration)} step={1}
          value={Math.min(Math.max(0, position), Math.max(1, duration))}
          disabled={!duration}
          onChange={event => seekAudio(Number(event.target.value))}
          aria-label="تغيير موضع التلاوة" className="min-w-0 flex-1 accent-[#15586e] disabled:opacity-40" />
        <span className="w-10 text-center tabular-nums">{formatSeconds(duration)}</span>
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f0e6d4] px-3 py-2">
        <span className="rounded-full bg-[#f0f6f5] px-2.5 py-1 text-[11px] font-bold text-[#236073]">{active ? section : 'أدوات القراءة'}</span>
        <div className="flex min-w-0 items-center gap-1">
          {active && !showMushaf && playback.queue.length > 1 && <>
            <button type="button" onClick={() => appAudio.next(-1)} aria-label="التسجيل السابق" title="السابق"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#15586e] hover:bg-[#e9f1ee]">
              <SkipBack size={17} />
            </button>
            <button type="button" onClick={() => appAudio.next(1)} aria-label="التسجيل التالي" title="التالي"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#15586e] hover:bg-[#e9f1ee]">
              <SkipForward size={17} />
            </button>
          </>}
          <button type="button" onClick={openTimer} aria-label="ضبط مؤقت إيقاف القراءة والصوت" title="مؤقت القراءة"
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-[#e8d9bd] bg-[#fbf4e8] px-3 text-xs font-extrabold text-[#85632f] transition active:scale-95">
            <MoonStar size={16} aria-hidden="true" />
            <span>{timerText}</span>
          </button>
        </div>
      </div>
    </aside>
  )
}