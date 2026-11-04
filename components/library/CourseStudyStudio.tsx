'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react'
import { claimAudioFocus } from '@/lib/audio-focus'
import {
  loadYoutubePlayer,
  youtubeSource,
  youtubeError,
  type StudyPlayer,
} from '@/lib/islamic/youtube-player'
import type { LearningCourse } from '@/lib/islamic/curriculum'
import {
  directVideo,
  effectivePolicy,
  mergeLibraryBook,
  playlistLessons,
  studySources,
  type ManagedBook,
  type ManagedLesson,
} from '@/lib/islamic/managed-library'
import PdfBookReader from './PdfBookReader'
import StudyWorkspace from './StudyWorkspace'

const input = 'w-full rounded-xl border border-[#d2c4a7] bg-white p-3 text-base text-slate-900 outline-none'
const btn =
  'inline-flex min-h-10 items-center justify-center gap-1 rounded-xl border border-[#d2c4a7] bg-white px-3 py-2 text-xs font-bold disabled:opacity-40'
const format = (seconds: number) => {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
}
type Memory = { order: number; time: number }
export default function CourseStudyStudio({
  book: inputBook,
  showPdf = true,
}: {
  book: LearningCourse
  showPdf?: boolean
}) {
  const book = useMemo(() => mergeLibraryBook(inputBook.id, inputBook, inputBook)!, [inputBook])
  const sources = useMemo(() => studySources(book), [book])
  const [selected, setSelected] = useState(''),
    [playlistIds, setPlaylistIds] = useState<string[]>([])
  const source = sources.find((item) => item.key === selected) || sources[0]
  const [activeId, setActiveId] = useState(''),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  const [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [rate, setRate] = useState(1),
    [rates, setRates] = useState<number[]>([1])
  const [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [part, setPart] = useState(0),
    [volume, setVolume] = useState(100)
  const host = useRef<HTMLDivElement>(null),
    stage = useRef<HTMLElement>(null),
    video = useRef<HTMLVideoElement>(null),
    player = useRef<StudyPlayer | null>(null)
  const sourceKey = source?.key || '',
    isFile = !!directVideo(source?.url)
  const lessons = useMemo(
    () => (source?.list ? playlistLessons(book, source.list, playlistIds) : source?.lessons || []),
    [book, source, playlistIds],
  )
  const active = lessons.find((lesson) => lesson.id === activeId) || lessons[0]
  const index = active ? lessons.findIndex((lesson) => lesson.id === active.id) : -1
  // Playlist-level settings supply defaults for all entries unless an individual entry overrides them.
  const sourcePolicy = effectivePolicy(book, source?.lessons[0])
  const policyBook: ManagedBook = {
    ...book,
    lessonSeekDefault: sourcePolicy.allowSeeking,
    lessonSpeedDefault: sourcePolicy.allowSpeed,
  }
  const policy = effectivePolicy(source?.list ? policyBook : book, active)
  const live = useRef({ lessons, active, policy, book, sourceKey, index })
  live.current = { lessons, active, policy, book, sourceKey, index }
  const playLesson = useRef<(lesson: ManagedLesson, autoplay: boolean, seconds?: number) => void>(() => {})
  const memoryKey = `samee3_study_v2:${book.id}:${sourceKey}`
  const transport = JSON.stringify(
    source
      ? {
          key: source.key,
          url: source.url,
          lessons: source.lessons.map((lesson) => ({ id: lesson.id, url: lesson.url, order: lesson.order })),
        }
      : null,
  )
  const sourceOverrides = JSON.stringify(
    source?.list
      ? Object.entries(book.playlistPolicies)
          .filter(
            ([key, value]) =>
              (key.startsWith(`${source.list}:`) || /^\d+$/.test(key)) && (!!value.url || value.deleted),
          )
          .map(([key, value]) => [key, value.url, value.deleted])
      : [],
  )
  const seekId = useId()
  const pdfParts = book.pdfParts?.length
    ? book.pdfParts
    : book.downloadUrl
      ? [{ label: 'نسخة الكتاب', url: book.downloadUrl }]
      : []
  const chosenPart = Math.min(part, Math.max(0, pdfParts.length - 1))
  const remember = (currentTime: number, lesson = live.current.active) => {
    if (!lesson) return
    try {
      localStorage.setItem(memoryKey, JSON.stringify({ order: lesson.order, time: Math.max(0, currentTime) }))
    } catch {
      /* storage may be unavailable */
    }
  }

  useEffect(() => {
    let alive = true,
      current: StudyPlayer | null = null,
      timer: ReturnType<typeof setInterval> | undefined,
      readyDeadline: ReturnType<typeof setTimeout> | undefined
    let saved: Memory = { order: 0, time: 0 },
      discovered = false,
      currentLesson: ManagedLesson | undefined,
      lastSave = 0
    setReady(false)
    setError('')
    setPlaylistIds([])
    setActiveId('')
    setTime(0)
    setDuration(0)
    setPlaying(false)
    setRate(1)
    setPage(0)
    try {
      const value = JSON.parse(localStorage.getItem(memoryKey) || '{}')
      saved = {
        order: Number.isFinite(value.order) ? Math.max(0, value.order) : 0,
        time: Number.isFinite(value.time) ? Math.max(0, value.time) : 0,
      }
    } catch {
      /* no saved position */
    }
    if (!source) return
    if (source.external) {
      setActiveId(source.lessons[0]?.id || '')
      setReady(false)
      return
    }
    if (isFile) {
      setActiveId(source.lessons[0]?.id || '')
      setReady(true)
      return () => {
        const element = video.current
        if (element) remember(element.currentTime, source.lessons[0])
      }
    }
    readyDeadline = setTimeout(() => { if (alive) setError('لم يكتمل تحميل الشرح. أعد المحاولة أو افتح الدرس من YouTube. قد يمنع اتصال الشبكة تشغيل المشغل المدمج.') }, 25000)
    const play = (lesson: ManagedLesson, autoplay: boolean, seconds = 0) => {
      const id = youtubeSource(lesson.url)?.video
      if (!alive || !current || !id) return
      currentLesson = lesson
      setActiveId(lesson.id)
      setTime(seconds)
      setRate(1)
      setError('')
      const value = { videoId: id, startSeconds: seconds }
      if (autoplay) current.loadVideoById(value)
      else current.cueVideoById(value)
    }
    playLesson.current = play
    const sync = () => {
      if (!alive || !current) return
      if (source.list && !discovered) {
        const ids = current.getPlaylist()
        if (!ids?.length) return
        discovered = true
        setPlaylistIds(ids)
        const visible = playlistLessons(live.current.book, source.list, ids)
        const first = visible.find((lesson) => lesson.order === saved.order) || visible[0]
        if (first) play(first, false, first.order === saved.order ? saved.time : 0)
        else {
          current.pauseVideo()
          setError('لا توجد دروس ظاهرة في هذه القائمة حاليًا.')
        }
      }
      const seconds = Math.max(0, current.getCurrentTime() || 0)
      setTime(seconds)
      setDuration(Math.max(0, current.getDuration() || 0))
      setPlaying(current.getPlayerState() === 1)
      const available = current.getAvailablePlaybackRates() || [1]
      setRates((old) => (old.join(',') === available.join(',') ? old : available))
      if (!live.current.policy.allowSpeed && current.getPlaybackRate() !== 1) current.setPlaybackRate(1)
      setRate(current.getPlaybackRate() || 1)
      if (Date.now() - lastSave > 4000 && currentLesson) {
        remember(seconds, currentLesson)
        lastSave = Date.now()
      }
    }
    void loadYoutubePlayer()
      .then((api) => {
        if (!alive || !host.current) return
        const iframe = document.createElement('iframe')
        iframe.title = `شرح ${book.title}`
        iframe.referrerPolicy = 'strict-origin-when-cross-origin'
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
        iframe.allowFullscreen = true
        const embed = new URL(
          `https://www.youtube.com/embed/${source.list ? 'videoseries' : youtubeSource(source.lessons[0]?.url)?.video || ''}`,
        )
        for (const [key, value] of Object.entries({
          enablejsapi: '1',
          origin: location.origin,
          playsinline: '1',
          rel: '0',
          controls: sourcePolicy.allowSeeking ? '1' : '0',
          disablekb: '1',
        }))
          embed.searchParams.set(key, value)
        if (source.list) embed.searchParams.set('list', source.list)
        iframe.src = embed.href
        host.current.replaceChildren(iframe)
        current = new api.Player(iframe, {
          width: '100%',
          height: '100%',
          host: 'https://www.youtube.com',
          playerVars: { origin: location.origin, playsinline: 1, rel: 0, controls: 0, disablekb: 1 },
          events: {
            onReady: (event) => {
              if (!alive) return
              clearTimeout(readyDeadline)
              current = event.target
              player.current = current
              current.setVolume(volume)
              setReady(true)
              if (source.list)
                current.cuePlaylist({
                  list: source.list,
                  listType: 'playlist',
                  index: Math.max(0, saved.order - 1),
                  startSeconds: saved.time,
                })
              else {
                discovered = true
                const first =
                  source.lessons.find((lesson) => lesson.order === saved.order) || source.lessons[0]
                if (first) play(first, false, first.order === saved.order ? saved.time : 0)
              }
              timer = setInterval(sync, 500)
              sync()
            },
            onStateChange: (event) => {
              if (!alive) return
              if (event.data === 1) claimAudioFocus(null)
              if (event.data === 0 && discovered && currentLesson) {
                const currentLessons = live.current.lessons,
                  at = currentLessons.findIndex((lesson) => lesson.id === currentLesson?.id)
                if (at >= 0 && at + 1 < currentLessons.length) play(currentLessons[at + 1], true)
              }
              sync()
            },
            onError: (event) => {
              if (alive) setError(youtubeError(event.data))
            },
          },
        })
      })
      .catch((error) => {
        if (alive) setError(error instanceof Error ? error.message : 'تعذّر تحميل مشغل الشرح.')
      })
    return () => {
      if (current && currentLesson) {
        try {
          remember(current.getCurrentTime() || 0, currentLesson)
        } catch {
          /* player already closed */
        }
      }
      alive = false
      clearTimeout(readyDeadline)
      clearInterval(timer)
      playLesson.current = () => {}
      if (player.current === current) player.current = null
      try {
        current?.destroy()
      } catch {
        /* iframe already removed */
      }
    }
    // Transport changes reload the source, while title and policy changes apply without restarting it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, transport, sourceOverrides, retry])

  useEffect(() => {
    if (!policy.allowSpeed) {
      try {
        player.current?.setPlaybackRate(1)
        if (video.current) video.current.playbackRate = 1
      } catch {
        /* player not ready */
      }
      setRate(1)
    }
  }, [policy.allowSpeed, active?.id])
  const toggle = () => {
    if (isFile) {
      const element = video.current
      if (!element) return
      if (!element.paused) element.pause()
      else void element.play().catch(() => setError('اضغط تشغيل مرة أخرى للسماح بالصوت.'))
    } else if (player.current) {
      if (playing) player.current.pauseVideo()
      else player.current.playVideo()
    }
  }
  const seek = (seconds: number) => {
    if (!policy.allowSeeking || !ready || !Number.isFinite(seconds)) return
    const at = Math.min(duration, Math.max(0, seconds))
    if (isFile && video.current) video.current.currentTime = at
    else player.current?.seekTo(at, true)
    setTime(at)
  }
  const changeRate = (speed: number) => {
    if (!policy.allowSpeed || !ready || !rates.includes(speed)) return
    if (isFile && video.current) video.current.playbackRate = speed
    else player.current?.setPlaybackRate(speed)
  }
  const goto = (lesson: ManagedLesson) => {
    if (ready) playLesson.current(lesson, true)
  }
  const fileAllowedTime = useRef(0),
    fileLastTick = useRef(0)
  const filtered = lessons.filter((lesson) =>
    `${lesson.title} ${lesson.order}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / 40)),
    shownPage = Math.min(page, pages - 1)
  const sourcePicker = sources.length > 1 && (
    <label className="block text-sm font-bold">
      الشروح المتاحة
      <select
        className={`mt-2 ${input}`}
        value={sourceKey}
        onChange={(event) => {
          setSelected(event.target.value)
          setQuery('')
          setPage(0)
        }}
      >
        {sources.map((item) => (
          <option key={item.key} value={item.key}>
            {item.title}
          </option>
        ))}
      </select>
    </label>
  )
  const mediaPanel = (
    <>
      <section
        ref={stage}
        className="shrink-0 overflow-hidden rounded-2xl border border-[#ded3bd] bg-[#f7f2e7] shadow-sm [&:fullscreen]:flex [&:fullscreen]:flex-col [&:fullscreen>div:first-child]:min-h-0 [&:fullscreen>div:first-child]:flex-1 [&:fullscreen>div:first-child]:aspect-auto"
      >
        <div
          className={`relative min-h-[200px] w-full bg-[#102e32] ${showPdf ? 'h-[200px] lg:h-[203px]' : 'aspect-video'}`}
        >
          {!source && <p className="p-5 text-sm text-white">لا يوجد شرح مرئي لهذا الكتاب حاليًا.</p>}
          {source?.external ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-5 text-center text-white">
              <p className="text-sm">
                هذا الشرح متاح من موقع الناشر. إعدادات السرعة والشريط داخله تابعة للمصدر.
              </p>
              <a className={btn} href={source.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} />
                فتح الشرح من المصدر
              </a>
            </div>
          ) : isFile && source ? (
            <video
              key={source.url}
              ref={video}
              src={source.url}
              playsInline
              preload="metadata"
              controls={false}
              className="h-full w-full"
              onLoadedMetadata={(event) => {
                const element = event.currentTarget
                setReady(true)
                setDuration(element.duration || 0)
                setRates([0.75, 1, 1.25, 1.5, 2])
                try {
                  const saved = JSON.parse(localStorage.getItem(memoryKey) || '{}')
                  if (Number.isFinite(saved.time))
                    element.currentTime = Math.min(element.duration, Math.max(0, saved.time))
                } catch {
                  /* no saved position */
                }
                fileAllowedTime.current = element.currentTime
                fileLastTick.current = Date.now()
              }}
              onPlay={() => {
                claimAudioFocus(null)
                setPlaying(true)
              }}
              onPause={() => {
                setPlaying(false)
                if (video.current) remember(video.current.currentTime)
              }}
              onTimeUpdate={(event) => {
                const element = event.currentTarget,
                  elapsed = Math.max(0, (Date.now() - fileLastTick.current) / 1000)
                if (
                  !live.current.policy.allowSeeking &&
                  Math.abs(element.currentTime - fileAllowedTime.current) >
                    Math.max(2, elapsed * Math.max(1, element.playbackRate) + 1)
                ) {
                  element.currentTime = fileAllowedTime.current
                  return
                }
                fileAllowedTime.current = element.currentTime
                fileLastTick.current = Date.now()
                setTime(element.currentTime)
                remember(element.currentTime)
              }}
              onRateChange={(event) => {
                const element = event.currentTarget
                if (!live.current.policy.allowSpeed && element.playbackRate !== 1) element.playbackRate = 1
                setRate(element.playbackRate)
              }}
              onEnded={() => setPlaying(false)}
              onError={() => setError('تعذّر تشغيل ملف الفيديو. تحقق من الرابط وصلاحية عرض الملف.')}
            />
          ) : (
            <div ref={host} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
          )}
        </div>
        <div className="space-y-2 p-2">
          <p className="text-sm font-bold">{active?.title || source?.title || 'شرح الكتاب'}</p>
          {(active?.author || book.videoAuthor) && (
            <p className="text-xs text-slate-600">شرح {active?.author || book.videoAuthor}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn} disabled={!ready || !active} onClick={toggle}>
              {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'إيقاف مؤقت' : 'تشغيل'}
            </button>
            {!isFile && (
              <>
                <button
                  type="button"
                  className={btn}
                  disabled={!ready || index <= 0}
                  onClick={() => goto(lessons[index - 1])}
                >
                  <ChevronRight size={16} />
                  السابق
                </button>
                <button
                  type="button"
                  className={btn}
                  disabled={!ready || index < 0 || index >= lessons.length - 1}
                  onClick={() => goto(lessons[index + 1])}
                >
                  التالي
                  <ChevronLeft size={16} />
                </button>
              </>
            )}
            <button
              type="button"
              className={btn}
              aria-label="ملء الشاشة"
              onClick={() => {
                const element = stage.current
                if (element?.requestFullscreen) void element.requestFullscreen().catch(() => {})
                else
                  void (
                    video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
                  )?.webkitEnterFullscreen?.()
              }}
            >
              <Maximize size={16} />
            </button>
            {active?.url && (
              <a
                className={`${btn} mr-auto`}
                href={active.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="فتح الدرس من المصدر"
              >
                <ExternalLink size={16} />
              </a>
            )}
          </div>
          {duration > 0 &&
            (policy.allowSeeking ? (
              <div>
                <label htmlFor={seekId} className="sr-only">
                  تقديم وتأخير الفيديو
                </label>
                <input
                  id={seekId}
                  type="range"
                  dir="ltr"
                  min={0}
                  max={duration}
                  value={Math.min(time, duration)}
                  step={1}
                  onChange={(event) => seek(Number(event.target.value))}
                  className="block h-3 w-full accent-teal-700"
                />
              </div>
            ) : (
              <div
                role="progressbar"
                aria-label="تقدم الدرس"
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={Math.min(time, duration)}
                className="h-2 overflow-hidden rounded-full bg-slate-300"
              >
                <div
                  className="h-full bg-teal-700"
                  style={{ width: `${Math.min(100, (time / duration) * 100)}%` }}
                />
              </div>
            ))}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span dir="ltr">
              {format(time)} / {format(duration)}
            </span>
            {!policy.allowSeeking && <span>التقديم والتأخير غير متاحين لهذا الدرس</span>}
            {policy.allowSpeed && (
              <label className="mr-auto">
                السرعة{' '}
                <select
                  aria-label="سرعة التشغيل"
                  className="rounded-lg border bg-white p-2"
                  value={rate}
                  onChange={(event) => changeRate(Number(event.target.value))}
                >
                  {Array.from(new Set([...rates, rate]))
                    .sort((a, b) => a - b)
                    .map((speed) => (
                      <option key={speed} value={speed}>
                        {speed}×
                      </option>
                    ))}
                </select>
              </label>
            )}
            {source && (
              <label className="flex min-w-0 items-center gap-1.5">
                <Volume2 size={15} />
                <input
                  aria-label="مستوى الصوت"
                  className="h-3 w-20 min-w-0 accent-teal-700"
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    setVolume(value)
                    if (isFile && video.current) video.current.volume = value / 100
                    else player.current?.setVolume(value)
                  }}
                />
              </label>
            )}
          </div>
          {!ready && source && !source.external && !error && (
            <p className="flex items-center gap-2 text-xs">
              <Loader2 className="animate-spin" size={15} />
              جارٍ تحميل الشرح…
            </p>
          )}
        </div>
      </section>
      {error && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {error}{' '}
          <button type="button" className="underline" onClick={() => setRetry((value) => value + 1)}>
            <RotateCcw size={13} className="inline" /> إعادة المحاولة
          </button>
        </p>
      )}
    </>
  )
  const lessonMenu = !isFile && !source?.external && (
    <details className="rounded-2xl border bg-white p-3">
      <summary className="cursor-pointer text-sm font-bold">الدروس المتاحة ({lessons.length})</summary>
      <div className="mt-3 space-y-3">
        <input
          aria-label="البحث في الدروس"
          className={input}
          placeholder="ابحث برقم الدرس أو عنوانه"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(0)
          }}
        />
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">
          {filtered.slice(shownPage * 40, (shownPage + 1) * 40).map((lesson) => (
            <button
              type="button"
              key={lesson.id}
              className={`${btn} ${lesson.id === active?.id ? '!bg-teal-700 !text-white' : ''}`}
              disabled={!ready}
              onClick={() => goto(lesson)}
            >
              {lesson.title}
            </button>
          ))}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              className={btn}
              disabled={!shownPage}
              onClick={() => setPage(shownPage - 1)}
            >
              السابق
            </button>
            <span>
              {shownPage + 1} / {pages}
            </span>
            <button
              type="button"
              className={btn}
              disabled={shownPage + 1 >= pages}
              onClick={() => setPage(shownPage + 1)}
            >
              التالي
            </button>
          </div>
        )}
        {!lessons.length && (
          <p className="text-xs text-slate-500">
            قد يستغرق تحميل دروس قائمة الناشر لحظات. إذا لم تظهر، أعد المحاولة.
          </p>
        )}
      </div>
    </details>
  )
  const bookPanel = (
    <>
      {showPdf && pdfParts.length > 1 && (
        <label className="block text-sm font-bold">
          جزء الكتاب
          <select
            className={`mt-2 ${input}`}
            value={chosenPart}
            onChange={(event) => setPart(Number(event.target.value))}
          >
            {pdfParts.map((item, i) => (
              <option key={`${item.url}-${i}`} value={i}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {showPdf && (
        <PdfBookReader
          fill
          key={`${book.id}:${pdfParts[chosenPart]?.url || ''}`}
          bookId={book.id}
          title={book.title}
          url={pdfParts[chosenPart]?.url}
          readingUrl={book.readingUrl}
        />
      )}
    </>
  )
  return showPdf ? (
    <StudyWorkspace
      media={mediaPanel}
      book={bookPanel}
      sourcePicker={sourcePicker}
      lessons={lessonMenu}
      hasVideo={!!source}
    />
  ) : (
    <div dir="rtl" className="space-y-3 text-slate-900">
      {sourcePicker}
      {mediaPanel}
      {lessonMenu}
    </div>
  )
}
