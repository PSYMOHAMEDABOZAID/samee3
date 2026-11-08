'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BellRing,
  BookOpen,
  Heart,
  Home,
  List,
  Pause,
  Play,
  Square,
  User,
  Volume2,
} from 'lucide-react'

/**
 * SAMEE3 — Main navigation and small Quran playback controls.
 * Path: components/BottomNav.tsx
 *
 * Uses the existing global audio from the mushaf.
 * It never creates another audio element.
 */

type PersistentQuranAudio = HTMLAudioElement & {
  __samee3Continue?: boolean
  __samee3Serial?: number
  __samee3Switching?: boolean
  __samee3NetworkUrl?: string
  __samee3ReciterName?: string
  __samee3Surah?: number
}

type QuranWindow = Window & {
  __samee3PersistentAudio?: PersistentQuranAudio
}

type MiniPlayer = {
  visible: boolean
  playing: boolean
  surah: number
  reciter: string
}

const EMPTY_PLAYER: MiniPlayer = {
  visible: false,
  playing: false,
  surah: 0,
  reciter: '',
}

/**
 * Keep all legacy playback controls in this file for safe rollback.
 * The unified PersistentAudioPlayer is already mounted in app/layout.tsx,
 * so its modern design replaces the old duplicate bar on screen.
 * Set to true only if you intentionally remove the unified player.
 */
const SHOW_LEGACY_QURAN_BAR = false

const QURAN_SURAHS = [
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
]

function getAudio(): PersistentQuranAudio | null {
  if (typeof window === 'undefined') return null

  return (window as QuranWindow).__samee3PersistentAudio || null
}

function savePausedState(): void {
  // Keep surah, reciter and last position.
  // Change only the saved playback intention.
  try {
    const key = 'samee3_persistent_audio_v2'
    const raw = window.localStorage.getItem(key)

    if (!raw) return

    const parsed: unknown = JSON.parse(raw)

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return
    }

    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...parsed,
        playing: false,
        updatedAt: Date.now(),
      }),
    )
  } catch {
    // Safari may restrict localStorage.
  }
}

function suspendAudio(audio: PersistentQuranAudio): void {
  // Cancel continuous playback before pausing.
  // This is important when the next surah is pending.
  audio.__samee3Continue = false
  audio.__samee3Serial = Number(audio.__samee3Serial || 0) + 1
  audio.__samee3Switching = false

  audio.pause()
  savePausedState()
}

const NAV_ITEMS = [
  { label: 'الرئيسية', icon: Home, href: '/' },
  { label: 'المصحف', icon: BookOpen, href: '/mushaf' },
  { label: 'الأذكار', icon: Heart, href: '/adhkar' },
  { label: 'التذكير', icon: BellRing, href: '/notifications' },
  { label: 'الحساب', icon: User, href: '/profile' },
  { label: 'الفهرس', icon: List, href: '/surahs' },
] as const

export default function BottomNav() {
  const pathname = usePathname()

  const isMushafPage =
    pathname === '/mushaf' ||
    pathname.startsWith('/mushaf/')

  const [player, setPlayer] = useState<MiniPlayer>(
    EMPTY_PLAYER,
  )

  const [playError, setPlayError] = useState('')

  const keepPausedVisibleRef = useRef(false)

  const syncPlayer = useCallback(() => {
    const audio = getAudio()

    const hasSource = Boolean(
      audio?.src && audio.__samee3NetworkUrl,
    )

    const playing = Boolean(
      audio &&
      hasSource &&
      !audio.paused &&
      !audio.ended,
    )

    const visible = Boolean(
      hasSource &&
      (playing || keepPausedVisibleRef.current),
    )

    const next: MiniPlayer = {
      visible,
      playing,
      surah: Number(audio?.__samee3Surah || 0),
      reciter:
        audio?.__samee3ReciterName ||
        'تلاوة القرآن الكريم',
    }

    setPlayer((old) =>
      old.visible === next.visible &&
      old.playing === next.playing &&
      old.surah === next.surah &&
      old.reciter === next.reciter
        ? old
        : next,
    )
  }, [])

  useEffect(() => {
    if (isMushafPage) {
      // The mushaf already has its own audio control.
      keepPausedVisibleRef.current = false
      setPlayer(EMPTY_PLAYER)
      return
    }

    let observed: PersistentQuranAudio | null = null

    const onAudioPlay = () => {
      keepPausedVisibleRef.current = false
      setPlayError('')
      syncPlayer()
    }

    const onAudioUpdate = () => {
      syncPlayer()
    }

    const detach = (audio: PersistentQuranAudio) => {
      audio.removeEventListener('play', onAudioPlay)
      audio.removeEventListener('playing', onAudioPlay)
      audio.removeEventListener('pause', onAudioUpdate)
      audio.removeEventListener('ended', onAudioUpdate)
      audio.removeEventListener('loadedmetadata', onAudioUpdate)
      audio.removeEventListener('error', onAudioUpdate)
    }

    const attach = (audio: PersistentQuranAudio) => {
      audio.addEventListener('play', onAudioPlay)
      audio.addEventListener('playing', onAudioPlay)
      audio.addEventListener('pause', onAudioUpdate)
      audio.addEventListener('ended', onAudioUpdate)
      audio.addEventListener('loadedmetadata', onAudioUpdate)
      audio.addEventListener('error', onAudioUpdate)
    }

    const inspect = () => {
      const current = getAudio()

      if (current !== observed) {
        if (observed) detach(observed)

        observed = current

        if (observed) attach(observed)
      }

      syncPlayer()
    }

    // Detect audio created by the mushaf while keeping
    // event-based playback updates responsive.
    const intervalId = window.setInterval(
      inspect,
      1200,
    )

    window.addEventListener('focus', inspect)
    window.addEventListener('pageshow', inspect)

    document.addEventListener(
      'visibilitychange',
      inspect,
    )

    inspect()

    return () => {
      window.clearInterval(intervalId)

      window.removeEventListener('focus', inspect)
      window.removeEventListener('pageshow', inspect)

      document.removeEventListener(
        'visibilitychange',
        inspect,
      )

      if (observed) detach(observed)
    }
  }, [isMushafPage, syncPlayer])

  const pauseQuran = () => {
    const audio = getAudio()

    if (!audio) return

    keepPausedVisibleRef.current = true

    suspendAudio(audio)

    setPlayError('')
    syncPlayer()
  }

  const resumeQuran = async () => {
    const audio = getAudio()

    if (!audio?.src) return

    keepPausedVisibleRef.current = true
    setPlayError('')

    audio.__samee3Continue = true
    audio.__samee3Serial =
      Number(audio.__samee3Serial || 0) + 1

    try {
      await audio.play()

      // A Stop may have happened while play() was pending.
      if (!audio.__samee3Continue) {
        audio.pause()
      }
    } catch {
      audio.__samee3Continue = false
      savePausedState()

      setPlayError(
        'تعذر استكمال التلاوة. افتح المصحف واضغط تشغيل.',
      )
    } finally {
      syncPlayer()
    }
  }

  const stopQuran = () => {
    const audio = getAudio()

    if (audio) suspendAudio(audio)

    keepPausedVisibleRef.current = false

    setPlayError('')
    setPlayer(EMPTY_PLAYER)
  }

  // No duplicated navigation or audio bar inside the mushaf.
  if (isMushafPage) return null

  return (
    <>
      {SHOW_LEGACY_QURAN_BAR && player.visible && (
        <aside
          dir="rtl"
          aria-label="التحكم في تلاوة المصحف"
          className="fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-1/2 z-[95] flex w-[calc(100%-28px)] max-w-[365px] -translate-x-1/2 items-center gap-2 rounded-[20px] border border-[#e3cea7] bg-white/95 px-3 py-2.5 shadow-[0_8px_30px_rgba(12,49,63,0.18)] backdrop-blur-xl"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#f5ead4] text-[#9f7635]"
          >
            <Volume2 size={20} />
          </span>

          <Link
            href="/mushaf"
            aria-label="العودة إلى المصحف"
            className="min-w-0 flex-1"
          >
            <span className="block truncate text-[12px] font-extrabold text-[#184353]">
              {player.surah >= 1 && player.surah <= 114
                ? `سورة ${QURAN_SURAHS[player.surah - 1]}`
                : 'التلاوة القرآنية'}
            </span>

            <span className="mt-0.5 block truncate text-[11px] text-slate-500">
              {player.reciter}
            </span>
          </Link>

          <button
            type="button"
            onClick={() => {
              if (player.playing) {
                pauseQuran()
              } else {
                void resumeQuran()
              }
            }}
            aria-label={
              player.playing
                ? 'إيقاف التلاوة مؤقتًا'
                : 'استكمال التلاوة'
            }
            title={
              player.playing
                ? 'إيقاف مؤقت'
                : 'استكمال'
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#15586e] text-white transition active:scale-95"
          >
            {player.playing ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </button>

          <button
            type="button"
            onClick={stopQuran}
            aria-label="إيقاف صوت المصحف نهائيًا"
            title="إيقاف"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#edd6d0] bg-[#fff5f2] text-[#a44633] transition active:scale-95"
          >
            <Square size={16} fill="currentColor" />
          </button>
        </aside>
      )}

      {playError && (
        <p
          role="alert"
          dir="rtl"
          className="fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] left-1/2 z-[96] w-[calc(100%-28px)] max-w-[365px] -translate-x-1/2 rounded-xl border border-red-100 bg-white p-3 text-center text-xs text-red-700 shadow-md"
        >
          {playError}
        </p>
      )}

      <nav
        dir="rtl"
        aria-label="التنقل الرئيسي"
        className="fixed bottom-3 left-1/2 z-[90] w-[calc(100%-20px)] max-w-[620px] -translate-x-1/2 rounded-[24px] border border-[rgba(14,165,233,0.24)] bg-white/95 shadow-[0_10px_35px_rgba(15,23,42,0.12)] backdrop-blur-xl"
        style={{
          marginBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex h-[70px] items-stretch px-1.5 sm:px-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon

            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`)

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={
                  active ? 'page' : undefined
                }
                className="relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-[18px] transition-all duration-200 active:scale-95"
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 h-1 w-10 rounded-b-full bg-[#b18a4a]"
                  />
                )}

                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                    active ? 'bg-[#f5ead4]' : ''
                  }`}
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.5 : 2}
                    className={
                      active
                        ? 'text-[#a7813e]'
                        : 'text-slate-400'
                    }
                  />
                </span>

                <span
                  className={`mt-0.5 whitespace-nowrap text-[11px] font-bold leading-none ${
                    active
                      ? 'text-[#85662f]'
                      : 'text-slate-400'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}