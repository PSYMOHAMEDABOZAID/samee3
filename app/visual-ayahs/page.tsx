'use client'
// SAMEE3_COLLECTED_MANUAL_TRIM_V4
import {
  Samee3CollectedTrimEditor,
  applyStoredCollectedTrim,
} from './Samee3CollectedTrimEditor'

// SAMEE3_V11: smooth collected MP3 during final MP4 export.
import { muteEdgeGain, updateEdgeGain } from './collected-audio-edges'

import { claimAudioFocus } from '@/lib/audio-focus'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'

import Link from 'next/link'

import {
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  Film,
  Loader2,
  Pause,
  Play,
  RefreshCcw,
  Save,
  Share2,
  Trash2,
  Upload,
  Volume2,
  X,
} from 'lucide-react'

import {
  DEFAULT_VIDEO_DESIGN,
  FALLBACK_SURAHS,
  FONT_OPTIONS,
  MAX_AYAH_COUNT,
  MAX_BACKGROUND_BYTES,
  MAX_DURATION_SECONDS,
  READERS,
  TEMPLATE_PRESETS,
  fontById,
  type SurahInfo,
  type Verse,
  type VideoDesign,
  type VideoRatio,
} from '@/lib/samee3-visual-config'

import {
  SCENES,
  sceneFromFile,
  type Scene,
} from '@/lib/samee3-visual-library'

import {
  clipKeys,
  readClip,
  saveClip,
} from '@/lib/samee3-visual-storage'

import {
  drawVisualFrame,
  verseIndexAt,
  cleanPrefatoryBasmala,
  normalizeSurahName,
  SeamlessVideoLoop,
  waitForVideoFrame,
} from '@/lib/samee3-visual-render'

type Prepared = {
  verses: Verse[]
  buffers: AudioBuffer[]
  starts: number[]
  duration: number
  stream?: {
    url: string
    startSeconds: number
  }

      collectedOriginal?: {
        startSeconds: number
        duration: number
        starts: number[]
      }
    }

// SAMEE3_ALAFASY_COLLECTED_INDEX_VISUAL_V2
type CollectedClip = {
  url: string
  startSeconds: number
  duration: number
  starts: number[]
}

async function loadCollectedVisualClip(
  surah: number,
  numbers: readonly number[],
  signal: AbortSignal
): Promise<CollectedClip> {
  if (
    !Number.isInteger(surah) ||
    surah < 1 ||
    surah > 114 ||
    !numbers.length ||
    numbers.length > MAX_AYAH_COUNT ||
    numbers.some(
      (number, index) =>
        !Number.isInteger(number) ||
        number < 1 ||
        (
          index > 0 &&
          number !== numbers[index - 1] + 1
        )
    )
  ) {
    throw new Error('اختر آيات صحيحة ومتتابعة.')
  }

  const response = await fetch(
    '/api/alafasy-timings/' + surah,
    {
      signal,
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    throw new Error(
      'تعذر تحميل توقيتات العفاسي المجمع.'
    )
  }

  const payload: unknown = await response.json()

  if (!Array.isArray(payload)) {
    throw new Error('صيغة ملف التوقيتات غير صحيحة.')
  }

  const rows = new Map<
    number,
    { start: number; end: number }
  >()

  for (const raw of payload) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw)
    ) {
      continue
    }

    const item = raw as Record<string, unknown>

    const ayah = Number(item.ayah)
    const start = Number(item.start_time)
    const end = Number(item.end_time)

    if (
      !Number.isInteger(ayah) ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start
    ) {
      throw new Error('توقيتات التسجيل غير صالحة.')
    }

    if (rows.has(ayah)) {
      throw new Error('يوجد توقيت مكرر للآية.')
    }

    rows.set(ayah, { start, end })
  }

  const selected = numbers.map(number => rows.get(number))

  if (selected.some(item => !item)) {
    throw new Error('لم يتم العثور على توقيت بعض الآيات.')
  }

  const times = selected as Array<{
    start: number
    end: number
  }>

  for (let index = 1; index < times.length; index++) {
    if (
      times[index].start <
      times[index - 1].end - 1000
    ) {
      throw new Error('توقيتات الآيات غير متتابعة.')
    }
  }

  const first = times[0].start
  const last = times[times.length - 1].end
  const duration = (last - first) / 1000

  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_DURATION_SECONDS
  ) {
    throw new Error(
      'مدة التلاوة تتجاوز الحد المتاح. اختر آيات أقل.'
    )
  }

  return {
    url:
      '/api/alafasy-audio/' +
      String(surah).padStart(3, '0') +
      '.mp3',
    startSeconds: first / 1000,
    duration,
    starts: times.map(
      item => (item.start - first) / 1000
    ),
  }
}

type ExportFile = {
  url: string
  blob: Blob
  filename: string
}

type Busy = 'idle' | 'prepare' | 'export'

type BackgroundPhase =
  | 'loading'
  | 'ready'
  | 'needs-play'
  | 'error'

type GalleryResponse = {
  files: Array<{
    filename: string
    size: number
  }>
  warning?: string
}

type StoredTemplate = {
  id: string
  name: string
  design: VideoDesign
}

const CUSTOM_KEY = 'samee3-visual-custom-templates-v2'

const primary =
  'inline-flex min-h-12 items-center justify-center gap-2 ' +
  'rounded-2xl bg-[#245343] px-5 py-3 text-sm font-bold ' +
  'text-white disabled:opacity-45'

const secondary =
  'inline-flex min-h-12 items-center justify-center gap-2 ' +
  'rounded-2xl border border-[#e0d9c8] bg-white ' +
  'px-5 py-3 text-sm font-bold text-[#2a5446] ' +
  'disabled:opacity-45'

const field =
  'mt-2 min-h-12 w-full rounded-xl border ' +
  'border-[#e4ddce] bg-white px-3 py-2 text-sm ' +
  'outline-none focus:border-[#b79a5b]'

const section =
  'rounded-[24px] border border-[#e7dfd0] ' +
  'bg-white p-5 shadow-sm'

function digits(n: number) {
  return n.toLocaleString(
    'ar-EG',
    { useGrouping: false }
  )
}

function durationText(s: number) {
  const minutes = Math.floor(s / 60)
  const seconds = Math.floor(s % 60)

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

async function requestJSON<T>(
  url: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
  })

  const data: unknown = await response.json()

  if (!response.ok) {
    const detail = data as { error?: string }

    throw new Error(
      detail.error || 'تعذّر تحميل البيانات.'
    )
  }

  return data as T
}

function stopGlobalAudio() {
  claimAudioFocus(null)

  document
    .querySelectorAll<HTMLAudioElement>('audio')
    .forEach((media) => media.pause())

  const state = window as Window & {
    __samee3PersistentAudio?:
      HTMLAudioElement & {
        __samee3Continue?: boolean
      }
  }

  if (state.__samee3PersistentAudio) {
    state.__samee3PersistentAudio.__samee3Continue = false
    state.__samee3PersistentAudio.pause()
  }
}

function validateVideo(file: File): string | null {
  if (!/\.(mp4|webm)$/i.test(file.name)) {
    return 'اختر فيديو MP4 أو WebM.'
  }

  if (
    file.type &&
    !/^video\/(mp4|webm)$/i.test(file.type)
  ) {
    return 'نوع الفيديو غير مدعوم.'
  }

  if (
    !file.size ||
    file.size > MAX_BACKGROUND_BYTES
  ) {
    return 'حجم الفيديو يجب أن يكون أقل من 40 ميجابايت.'
  }

  return null
}

function SceneCard({
  item,
  selected,
  disabled,
  onPick,
}: {
  item: Scene
  selected: boolean
  disabled: boolean
  onPick: () => void
}) {
  const [preview, setPreview] =
    useState(item.videoURL || '')

  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(false)

  const cardRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const element = cardRef.current

    if (!element) return

    if (
      typeof IntersectionObserver === 'undefined'
    ) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting)
      },
      {
        rootMargin: '100px 0px',
        threshold: 0.01,
      }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const player = playerRef.current

    if (!player) return

    if (!visible) {
      player.pause()
      return
    }

    void player.play().catch(() => {})
  }, [visible, preview])

  useEffect(() => {
    let active = true
    let objectURL: string | null = null

    setFailed(false)

    if (item.videoURL) {
      setPreview(item.videoURL)
      return
    }

    if (
      !item.id.startsWith('local:') ||
      !visible
    ) {
      setPreview('')
      return
    }

    setPreview('')

    readClip(item.id)
      .then((file) => {
        if (!active || !file) return

        objectURL = URL.createObjectURL(file)
        setPreview(objectURL)
      })
      .catch(() => {})

    return () => {
      active = false

      if (objectURL) {
        URL.revokeObjectURL(objectURL)
      }
    }
  }, [
    item.id,
    item.videoURL,
    visible,
  ])

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={() => {
        void playerRef.current
          ?.play()
          .catch(() => {})

        onPick()
      }}
      className={
        'overflow-hidden rounded-2xl border-2 ' +
        'bg-white text-right shadow-sm ' +
        (
          selected
            ? 'border-[#b79859]'
            : 'border-white'
        )
      }
    >
      <div
        ref={cardRef}
        className="relative aspect-[4/5] overflow-hidden bg-[#123]"
      >
        {preview && visible && !failed ? (
          <video
            ref={playerRef}
            src={preview}
            onError={() => setFailed(true)}
            muted
            loop
            autoPlay
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-5xl"
            style={{
              background:
                `linear-gradient(145deg,${item.tint},#0c2525)`,
            }}
          >
            {item.emoji}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />

        {selected && (
          <Check
            size={20}
            className="absolute left-2 top-2 rounded-full bg-white p-1 text-[#245343]"
          />
        )}

        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
          {item.group}
        </span>
      </div>

      <p className="break-words p-2 text-xs font-bold">
        {item.name}
      </p>
    </button>
  )
}

function RangeSetting({
  label,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label className="block text-sm font-bold">
      <span className="flex justify-between gap-2">
        <span>{label}</span>

        <span className="text-xs font-normal text-[#778477]">
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </span>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
        className="mt-3 w-full accent-[#ab8d51]"
      />
    </label>
  )
}

function ColorSetting({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-sm font-bold">
      {label}

      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="mt-2 h-12 w-full rounded-xl border border-[#e4ddce]"
      />
    </label>
  )
}

export default function VisualAyahsPage() {
  const [tab, setTab] = useState(1)
  const [category, setCategory] = useState('الكل')
  const [scene, setScene] = useState<Scene>(SCENES[0])

  const [repository, setRepository] =
    useState<Scene[]>([])

  const [local, setLocal] =
    useState<Scene[]>([])

  const [galleryRefresh, setGalleryRefresh] =
    useState(0)

  const [sceneRefresh, setSceneRefresh] =
    useState(0)

  const [galleryLoading, setGalleryLoading] =
    useState(false)

  const [galleryWarning, setGalleryWarning] =
    useState('')

  const [backgroundReady, setBackgroundReady] =
    useState(false)

  const [backgroundStatus, setBackgroundStatus] =
    useState('')

  const [backgroundPlaying, setBackgroundPlaying] =
    useState(false)

  const [backgroundPhase, setBackgroundPhase] =
    useState<BackgroundPhase>('loading')

  const [backgroundStarting, setBackgroundStarting] =
    useState(false)

  const [surahs, setSurahs] =
    useState<SurahInfo[]>(FALLBACK_SURAHS)

  const [surah, setSurah] = useState(13)

  const [verses, setVerses] =
    useState<Verse[]>([])

  const [versesLoading, setVersesLoading] =
    useState(true)

  const [versesError, setVersesError] =
    useState('')

  const [versesRefresh, setVersesRefresh] =
    useState(0)

  const [from, setFrom] = useState(28)
  const [to, setTo] = useState(28)
  const [reader, setReader] = useState('husary')

  const [prepared, setPrepared] =
    useState<Prepared | null>(null)

  const [design, setDesign] =
    useState<VideoDesign>(DEFAULT_VIDEO_DESIGN)

  const [customTemplateName, setCustomTemplateName] =
    useState('')

  const [customTemplates, setCustomTemplates] =
    useState<StoredTemplate[]>([])

  const [busy, setBusy] =
    useState<Busy>('idle')

  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  const [result, setResult] =
    useState<ExportFile | null>(null)

  const videoRef =
    useRef<HTMLVideoElement>(null)

  const loopVideoRef =
    useRef<HTMLVideoElement>(null)

  const canvasRef =
    useRef<HTMLCanvasElement>(null)

  const loopEngine =
    useRef<SeamlessVideoLoop | null>(null)

  const backgroundRequest = useRef(0)

  const backgroundController =
    useRef<AbortController | null>(null)

  const importRequest = useRef(0)
  const exportBusy = useRef(false)

  const audioContext =
    useRef<AudioContext | null>(null)

  const playbackSources =
    useRef<AudioBufferSourceNode[]>([])

  const collectedAudioRef =
    useRef<HTMLAudioElement | null>(null)

  const collectedAudioNodeRef =
    useRef<MediaElementAudioSourceNode | null>(null)

  const playback = useRef({
    playing: false,
    position: 0,
    begin: 0,
  })

  const preparedRef = useRef(prepared)

  const latest = useRef({
    scene,
    surah,
    surahs,
    verses,
    from,
    reader,
    design,
  })

  const rafRef = useRef(0)
  const requestId = useRef(0)

  const preparationAbort =
    useRef<AbortController | null>(null)

  const resultObjectURL =
    useRef<string | null>(null)

  const exportCancel =
    useRef<(() => void) | null>(null)

  const exportTime =
    useRef<number | null>(null)

  const pageMounted = useRef(true)

  preparedRef.current = prepared

  latest.current = {
    scene,
    surah,
    surahs,
    verses,
    from,
    reader,
    design,
  }

  const chosenVerses = useMemo(
    () =>
      verses.filter(
        (verse) =>
          verse.number >= from &&
          verse.number <= to
      ),
    [verses, from, to]
  )

  const allScenes = useMemo(
    () => [
      ...repository,
      ...local,
      ...SCENES,
    ],
    [repository, local]
  )

  const groups = useMemo(
    () => [
      'الكل',
      ...Array.from(
        new Set(
          allScenes.map((s) => s.group)
        )
      ),
    ],
    [allScenes]
  )

  const shownScenes = useMemo(
    () =>
      category === 'الكل'
        ? allScenes
        : allScenes.filter(
            (s) => s.group === category
          ),
    [category, allScenes]
  )

  const chapter = surahs.find(
    (s) => s.id === surah
  )

  const working = busy !== 'idle'

  const currentPreset =
    TEMPLATE_PRESETS.find(
      (item) =>
        item.design.quranFontId ===
          design.quranFontId &&
        item.design.uiFontId ===
          design.uiFontId
    )

  const clearResult = useCallback(() => {
    if (resultObjectURL.current) {
      URL.revokeObjectURL(
        resultObjectURL.current
      )
    }

    resultObjectURL.current = null
    setResult(null)
  }, [])

  const stopPlayback = useCallback(
    (reset = false) => {
      const player = playback.current

      if (
        player.playing &&
        preparedRef.current?.stream &&
        collectedAudioRef.current
      ) {
        const clip = preparedRef.current
        player.position = Math.max(
          0,
          Math.min(
            clip.duration,
            collectedAudioRef.current.currentTime -
              clip.stream!.startSeconds
          )
        )
      } else if (
        player.playing &&
        audioContext.current
      ) {
        player.position = Math.max(
          0,
          audioContext.current.currentTime -
            player.begin
        )
      }

      player.playing = false

      for (
        const source of playbackSources.current
      ) {
        try {
          source.stop()
          source.disconnect()
        } catch {}
      }

      playbackSources.current = []
      collectedAudioRef.current?.pause()

      if (reset) player.position = 0

      setPlaying(false)
      setPosition(player.position)
    },
    []
  )

  const invalidatePreparation =
    useCallback(() => {
      requestId.current += 1

      preparationAbort.current?.abort()
      preparationAbort.current = null

      stopPlayback(true)

      preparedRef.current = null
      setPrepared(null)

      setError('')
      clearResult()
    }, [
      stopPlayback,
      clearResult,
    ])

  const changeDesign = useCallback(
    (patch: Partial<VideoDesign>) => {
      clearResult()

      setDesign((previous) => ({
        ...previous,
        ...patch,
      }))
    },
    [clearResult]
  )

  const applyTemplate = useCallback(
    (preset: { design: Partial<VideoDesign> }) => {
      clearResult()

      setDesign((previous) => ({
        ...previous,
        ...preset.design,
        signature:
          previous.signature ||
          DEFAULT_VIDEO_DESIGN.signature,
      }))
    },
    [clearResult]
  )

  const persistTemplates = useCallback(
    (items: StoredTemplate[]) => {
      setCustomTemplates(items)

      try {
        localStorage.setItem(
          CUSTOM_KEY,
          JSON.stringify(items)
        )
      } catch {}
    },
    []
  )

  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(CUSTOM_KEY)

      if (!raw) return

      const parsed =
        JSON.parse(raw) as StoredTemplate[]

      if (Array.isArray(parsed)) {
        setCustomTemplates(parsed)
      }
    } catch {}
  }, [])

  // تحميل فهرس السور مستقل عن الخلفيات.
  useEffect(() => {
    const controller =
      new AbortController()

    requestJSON<{ surahs: SurahInfo[] }>(
      '/api/visual-ayahs?kind=surahs',
      controller.signal
    )
      .then((data) => {
        if (data.surahs?.length === 114) {
          setSurahs(data.surahs)
        }
      })
      .catch(() => {})

    return () => controller.abort()
  }, [])

  // تحميل الآيات مكتوبة.
  useEffect(() => {
    const controller =
      new AbortController()

    setVersesLoading(true)
    setVersesError('')
    setVerses([])

    requestJSON<{ ayahs: Verse[] }>(
      `/api/visual-ayahs?kind=verses&surah=${surah}`,
      controller.signal
    )
      .then((data) => {
        if (controller.signal.aborted) return

        setVerses(data.ayahs)

        const lastVerse =
          data.ayahs.length > 0
            ? data.ayahs[
                data.ayahs.length - 1
              ].number
            : 1

        setFrom(
          (value) =>
            Math.min(value, lastVerse)
        )

        setTo(
          (value) =>
            Math.min(
              Math.max(value, 1),
              lastVerse
            )
        )
      })
      .catch((cause) => {
        if (controller.signal.aborted) return

        setVersesError(
          cause instanceof Error
            ? cause.message
            : 'تعذّر تحميل السورة.'
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setVersesLoading(false)
        }
      })

    return () => controller.abort()
  }, [surah, versesRefresh])

  // قراءة فيديوهات GitHub.
  useEffect(() => {
    const controller =
      new AbortController()

    setGalleryLoading(true)

    requestJSON<GalleryResponse>(
      '/api/visual-backgrounds',
      controller.signal
    )
      .then((data) => {
        if (controller.signal.aborted) return

        setRepository(
          (data.files || []).map(
            (item) =>
              sceneFromFile(
                item.filename,
                'repository'
              )
          )
        )

        setGalleryWarning(
          data.warning || ''
        )
      })
      .catch((cause) => {
        if (controller.signal.aborted) return

        setGalleryWarning(
          cause instanceof Error
            ? cause.message
            : 'تعذّر تحديث المكتبة.'
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setGalleryLoading(false)
        }
      })

    return () => controller.abort()
  }, [galleryRefresh])

  // قراءة الفيديوهات المحفوظة في الجهاز.
  useEffect(() => {
    let active = true

    clipKeys()
      .then((keys) => {
        if (!active) return

        setLocal(
          keys
            .filter(
              (key) =>
                key.startsWith('local:')
            )
            .map(
              (key) =>
                sceneFromFile(
                  key.slice('local:'.length),
                  'local'
                )
            )
        )
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  // Backgrounds are public. Only imported clips need optional local storage.
  useEffect(() => {
    const id =
      ++backgroundRequest.current

    const controller =
      new AbortController()

    backgroundController.current = controller

    let temporaryURL:
      string | null = null

    let engine:
      SeamlessVideoLoop | null = null

    const element = videoRef.current
    const alternate = loopVideoRef.current

    if (!element) return

    const current = () =>
      !controller.signal.aborted &&
      id === backgroundRequest.current

    loopEngine.current?.stop()
    loopEngine.current = null

    for (
      const video of [
        element,
        alternate,
      ]
    ) {
      if (!video) continue

      video.pause()
      video.removeAttribute('src')
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      video.load()
    }

    setBackgroundReady(false)
    setBackgroundPlaying(false)
    setBackgroundStarting(false)
    setBackgroundPhase('loading')
    setBackgroundStatus(
      'جارٍ تحميل الخلفية…'
    )

    async function openScene() {
      try {
        let url =
          scene.videoURL ||
          (
            scene.id === 'flowers-demo'
              ? '/api/visual-ayahs?kind=demo'
              : ''
          )

        if (
          scene.id.startsWith('local:')
        ) {
          const stored =
            await readClip(scene.id)

          if (!current()) return

          if (!stored) {
            throw new Error(
              'الفيديو المحلي غير متاح. استورده من جهازك مرة أخرى.'
            )
          }

          temporaryURL =
            URL.createObjectURL(stored)

          url = temporaryURL
        }

        if (!current()) return

        if (!url) {
          throw new Error(
            'الخلفية غير متاحة. اختر خلفية أخرى أو استورد فيديو من جهازك.'
          )
        }

        element!.src = url
        element!.load()

        if (alternate) {
          alternate.src = url
          alternate.load()

          engine = new SeamlessVideoLoop(
            element!,
            alternate,
            latest.current.design.loopFade
          )

          loopEngine.current = engine
        }

        // A decoded frame and permission to autoplay are separate states.
        const decoded = waitForVideoFrame(
          element!,
          {
            signal: controller.signal,
          }
        )

        if (engine) {
          void engine
            .start({
              signal: controller.signal,
            })
            .then((playing) => {
              if (
                !current() ||
                element!.error
              ) {
                return
              }

              setBackgroundPlaying(playing)

              if (!playing) {
                setBackgroundPhase(
                  'needs-play'
                )

                setBackgroundStatus(
                  'اضغط تشغيل الخلفية لتجهيزها في هذا المتصفح.'
                )
              }
            })
            .catch((cause: unknown) => {
              if (
                !current() ||
                (
                  cause as {
                    name?: string
                  }
                )?.name === 'AbortError'
              ) {
                return
              }

              if (element!.error) return

              setBackgroundPhase(
                'needs-play'
              )

              setBackgroundStatus(
                'اضغط تشغيل الخلفية، أو أعد تحميلها إذا استمر التعطل.'
              )
            })
        }

        await decoded

        if (!current()) return

        const video =
          engine?.currentVideo ||
          element!

        setBackgroundReady(true)
        setBackgroundPlaying(!video.paused)

        setBackgroundPhase(
          video.paused
            ? 'needs-play'
            : 'ready'
        )

        setBackgroundStatus(
          video.paused
            ? 'الخلفية جاهزة؛ اضغط تشغيل الخلفية أو إنشاء الفيديو.'
            : ''
        )
      } catch (cause) {
        if (!current()) return

        const needsPlay =
          !element!.error &&
          element!.readyState >= 1

        setBackgroundReady(false)

        setBackgroundPhase(
          needsPlay
            ? 'needs-play'
            : 'error'
        )

        setBackgroundStatus(
          cause instanceof Error
            ? cause.message
            : 'تعذّر تحميل الخلفية. أعد المحاولة.'
        )
      }
    }

    void openScene()

    return () => {
      controller.abort()
      engine?.stop()

      if (
        loopEngine.current === engine
      ) {
        loopEngine.current = null
      }

      if (
        backgroundController.current ===
        controller
      ) {
        backgroundController.current = null
      }

      for (
        const video of [
          element,
          alternate,
        ]
      ) {
        video?.pause()
        video?.removeAttribute('src')
      }

      if (temporaryURL) {
        URL.revokeObjectURL(
          temporaryURL
        )
      }
    }
  }, [
    scene.id,
    scene.videoURL,
    sceneRefresh,
  ])

  function syncBackgroundPlayback() {
    const video =
      loopEngine.current?.currentVideo ||
      videoRef.current

    setBackgroundPlaying(
      Boolean(
        video &&
        !video.paused
      )
    )
  }

  async function activateBackground() {
    const id =
      backgroundRequest.current

    const engine =
      loopEngine.current

    if (!engine) {
      setSceneRefresh(
        (value) => value + 1
      )
      return
    }

    const signal =
      backgroundController.current?.signal

    setBackgroundStarting(true)
    setBackgroundStatus(
      'جارٍ تجهيز الخلفية…'
    )

    // start() reaches play() immediately, while the click still grants playback permission.
    const starting =
      engine.start({ signal })

    try {
      const [playing] =
        await Promise.all([
          starting,
          engine.ready({ signal }),
        ])

      if (
        id !== backgroundRequest.current ||
        signal?.aborted
      ) {
        return
      }

      setBackgroundReady(true)
      setBackgroundPlaying(playing)

      setBackgroundPhase(
        playing
          ? 'ready'
          : 'needs-play'
      )

      setBackgroundStatus(
        playing
          ? ''
          : 'المتصفح منع التشغيل. اضغط تشغيل الخلفية مرة أخرى أو راجع وضع توفير الطاقة.'
      )
    } catch (cause) {
      if (
        id !== backgroundRequest.current ||
        signal?.aborted
      ) {
        return
      }

      setBackgroundPhase(
        engine.currentVideo.error
          ? 'error'
          : 'needs-play'
      )

      setBackgroundStatus(
        cause instanceof Error
          ? cause.message
          : 'تعذّر تشغيل الخلفية.'
      )
    } finally {
      if (
        id === backgroundRequest.current
      ) {
        setBackgroundStarting(false)
      }
    }
  }

  // المعاينة تستخدم نفس الرسم المستخدم في التصدير.
  useEffect(() => {
    let lastPaint = 0

    function paint(now: number) {
      if (now - lastPaint > 35) {
        const canvas = canvasRef.current

        if (canvas) {
          const data = latest.current
          const prep = preparedRef.current
          const player = playback.current

          let second =
            exportTime.current ??
            player.position

          if (
            exportTime.current === null &&
            player.playing &&
            prep?.stream &&
            collectedAudioRef.current
          ) {
            second = Math.max(
              0,
              collectedAudioRef.current.currentTime -
                prep.stream.startSeconds
            )
          } else if (
            exportTime.current === null &&
            player.playing &&
            audioContext.current
          ) {
            second = Math.max(
              0,
              audioContext.current.currentTime -
                player.begin
            )
          }

          const index =
            prep
              ? verseIndexAt(
                  prep.starts,
                  second
                )
              : 0

          const verse =
            prep?.verses[index] ||
            data.verses.find(
              (item) =>
                item.number === data.from
            ) ||
            null

          const chapterName =
            data.surahs.find(
              (item) =>
                item.id === data.surah
            )?.name ||
            'القرآن الكريم'

          loopEngine.current?.setOverlap(
            data.design.loopFade
          )

          const frame =
            loopEngine.current?.frame()

          const verseForDisplay =
            verse
              ? {
                  ...verse,
                  text: cleanPrefatoryBasmala(
                    verse.text,
                    data.surah,
                    verse.number
                  ),
                }
              : null

          drawVisualFrame(
            canvas,
            frame?.primary ||
              videoRef.current,
            {
              surahName:
                normalizeSurahName(
                  chapterName
                ),

              readerName:
                READERS.find(
                  (item) =>
                    item.id === data.reader
                )?.name || '',

              verse: verseForDisplay,

              alternateVideo:
                frame?.secondary,

              backgroundMix:
                frame?.mix || 0,

              verseProgress:
                prep?.stream
                  ? Math.max(
                      0,
                      Math.min(
                        1,
                        (second - prep.starts[index]) /
                        Math.max(
                          0.01,
                          (
                            prep.starts[index + 1] ??
                            prep.duration
                          ) - prep.starts[index]
                        )
                      )
                    )
                  : prep &&
                    prep.buffers[index]?.duration
                    ? (
                        second -
                        prep.starts[index]
                      ) /
                      prep.buffers[index].duration
                    : 0,

              placeholder:
                'اختر آية من السورة لتظهر هنا',

              tint: data.scene.tint,
              design: data.design,
            }
          )

          if (
            prep &&
            exportTime.current === null &&
            player.playing
          ) {
            if (
              second >= prep.duration
            ) {
              stopPlayback(true)
              setPosition(prep.duration)
            } else if (
              Math.abs(
                second - player.position
              ) >= 0.15
            ) {
              player.position = second
              setPosition(second)
            }
          }
        }

        lastPaint = now
      }

      rafRef.current =
        requestAnimationFrame(paint)
    }

    rafRef.current =
      requestAnimationFrame(paint)

    return () =>
      cancelAnimationFrame(
        rafRef.current
      )
  }, [stopPlayback])

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return

      if (exportCancel.current) {
        exportCancel.current()
      } else {
        stopPlayback()
      }
    }

    document.addEventListener(
      'visibilitychange',
      onVisibility
    )

    return () =>
      document.removeEventListener(
        'visibilitychange',
        onVisibility
      )
  }, [stopPlayback])

  useEffect(() => {
    pageMounted.current = true

    return () => {
      pageMounted.current = false

      preparationAbort.current?.abort()
      exportCancel.current?.()

      playbackSources.current.forEach(
        (source) => {
          try {
            source.stop()
          } catch {}
        }
      )

      collectedAudioRef.current?.pause()
      collectedAudioRef.current?.removeAttribute('src')
      collectedAudioNodeRef.current?.disconnect()

      if (audioContext.current) {
        void audioContext.current
          .close()
          .catch(() => {})
      }

      if (resultObjectURL.current) {
        URL.revokeObjectURL(
          resultObjectURL.current
        )
      }
    }
  }, [])

  async function importVideo(file: File) {
    const message =
      validateVideo(file)

    if (message) {
      setError(message)
      return
    }

    const id =
      ++importRequest.current

    const added =
      sceneFromFile(
        file.name,
        'local'
      )

    setError('')

    // saveClip exposes the file in memory synchronously; persistence is optional.
    const saving =
      saveClip(added.id, file)

    setLocal((old) => [
      added,
      ...old.filter(
        (item) =>
          item.id !== added.id
      ),
    ])

    setBackgroundReady(false)
    setBackgroundPhase('loading')
    setScene(added)

    setSceneRefresh(
      (value) => value + 1
    )

    setStatus(
      'تم فتح الفيديو؛ جارٍ محاولة حفظه للاستخدام لاحقًا…'
    )

    void saving
      .then(() => {
        if (
          pageMounted.current &&
          id === importRequest.current
        ) {
          setStatus(
            'تم استيراد الفيديو وحفظه على هذا الجهاز.'
          )
        }
      })
      .catch(() => {
        if (
          pageMounted.current &&
          id === importRequest.current
        ) {
          setStatus(
            'الفيديو متاح في الجلسة الحالية. تعذّر حفظه للاستخدام بعد إغلاق الصفحة.'
          )
        }
      })
  }

  function pickScene(next: Scene) {
    if (working) return

    stopPlayback(true)
    clearResult()
    setError('')

    if (
      next.id === scene.id &&
      backgroundPhase === 'needs-play'
    ) {
      void activateBackground()
      return
    }

    setBackgroundReady(false)
    setBackgroundPhase('loading')
    setScene(next)

    setSceneRefresh(
      (value) => value + 1
    )
  }

  function changeSurah(
    nextSurah: number
  ) {
    invalidatePreparation()

    setSurah(nextSurah)
    setFrom(1)
    setTo(1)
  }

  function setRange(
    start: number,
    end: number
  ) {
    if (end < start) {
      setError(
        'اختر النهاية بعد البداية.'
      )
      return
    }

    if (
      end - start + 1 >
      MAX_AYAH_COUNT
    ) {
      setError(
        'الحد الأقصى عشر آيات متتابعة.'
      )
      return
    }

    invalidatePreparation()
    setError('')

    setFrom(start)
    setTo(end)
  }

  function chooseFirst(
    number: number
  ) {
    setRange(number, number)
  }

  function chooseLast(
    number: number
  ) {
    setRange(from, number)
  }

  function collectedAudioElement(
    prep: Prepared,
    context: AudioContext
  ): HTMLAudioElement {
    if (!prep.stream) {
      throw new Error('التسجيل المجمع غير مجهز.')
    }

    const url = new URL(
      prep.stream.url,
      window.location.href
    ).href

    if (
      collectedAudioRef.current &&
      collectedAudioRef.current.src === url
    ) {
      return collectedAudioRef.current
    }

    collectedAudioRef.current?.pause()
    collectedAudioNodeRef.current?.disconnect()

    const audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audio.preload = 'auto'
    audio.src = url

    const node = context.createMediaElementSource(audio)
    node.connect(context.destination)

    collectedAudioRef.current = audio
    collectedAudioNodeRef.current = node

    return audio
  }

  async function seekCollectedAudio(
    audio: HTMLAudioElement,
    target: number
  ): Promise<void> {
    if (audio.readyState < 1) {
      await new Promise<void>((resolve, reject) => {
        let timer = 0

        const cleanup = () => {
          window.clearTimeout(timer)
          audio.removeEventListener('loadedmetadata', ready)
          audio.removeEventListener('error', failed)
        }

        const ready = () => {
          cleanup()
          resolve()
        }

        const failed = () => {
          cleanup()
          reject(
            new Error('تعذر تحميل صوت العفاسي المجمع.')
          )
        }

        timer = window.setTimeout(failed, 20000)

        audio.addEventListener('loadedmetadata', ready)
        audio.addEventListener('error', failed)

        audio.load()
      })
    }

    audio.currentTime = target

    if (audio.seeking) {
      await new Promise<void>((resolve, reject) => {
        let timer = 0

        const finish = () => {
          window.clearTimeout(timer)
          audio.removeEventListener('seeked', finish)
          audio.removeEventListener('error', failed)
          resolve()
        }

        const failed = () => {
          window.clearTimeout(timer)
          audio.removeEventListener('seeked', finish)
          audio.removeEventListener('error', failed)
          reject(
            new Error('تعذر الانتقال إلى الآية المطلوبة.')
          )
        }

        timer = window.setTimeout(failed, 12000)

        audio.addEventListener('seeked', finish)
        audio.addEventListener('error', failed)
      })
    }
  }

  async function prepareAudio() {
    if (
      working ||
      versesLoading
    ) {
      return
    }

    if (
      chosenVerses.length !==
        to - from + 1 ||
      chosenVerses.length >
        MAX_AYAH_COUNT ||
      chosenVerses.length === 0
    ) {
      setError(
        'اختر آيات متتابعة وصحيحة أولًا.'
      )
      return
    }

    const controller =
      new AbortController()

    const id =
      ++requestId.current

    preparationAbort.current?.abort()
    preparationAbort.current = controller

    stopPlayback(true)

    preparedRef.current = null

    setPrepared(null)
    clearResult()
    stopGlobalAudio()

    setError('')
    setBusy('prepare')
    setStatus(
      'جارٍ تجهيز الآيات والتلاوة…'
    )

    try {
      if (!audioContext.current) {
        audioContext.current =
          new AudioContext()
      }

      const context =
        audioContext.current

      await context.resume()

      if (reader === 'alafasy-collected') {
        const clip = await loadCollectedVisualClip(
          surah,
          chosenVerses.map(verse => verse.number),
          controller.signal
        )

        if (id !== requestId.current) return

        const samee3AdjustedClip = applyStoredCollectedTrim(clip, surah, from, to)
        const created: Prepared = {
          verses: chosenVerses,
          buffers: [],
          starts: samee3AdjustedClip.starts,
          duration: samee3AdjustedClip.duration,
          stream: {
            url: clip.url,
            startSeconds: samee3AdjustedClip.startSeconds,
          },

      collectedOriginal: {
        startSeconds: clip.startSeconds,
        duration: clip.duration,
        starts: clip.starts,
      },
    }

        preparedRef.current = created
        setPrepared(created)

        setPosition(0)
        playback.current.position = 0
        setTab(3)
        return
      }

      const buffers: AudioBuffer[] = []
      const starts: number[] = []

      let duration = 0

      for (
        let index = 0;
        index < chosenVerses.length;
        index++
      ) {
        const verse =
          chosenVerses[index]

        if (
          id !== requestId.current
        ) {
          return
        }

        setStatus(
          `تحميل الآية ${
            digits(index + 1)
          } من ${
            digits(chosenVerses.length)
          }`
        )

        const params =
          new URLSearchParams({
            kind: 'audio',
            surah: String(surah),
            ayah: String(verse.number),
            reciter: reader,
          })

        const response = await fetch(
          `/api/visual-ayahs?${params}`,
          {
            signal: controller.signal,
          }
        )

        if (!response.ok) {
          const detail =
            await response.json().catch(
              () => ({
                error:
                  'تعذّر تحميل التلاوة.',
              })
            )

          throw new Error(
            detail.error ||
            'تعذّر تحميل التلاوة.'
          )
        }

        const encoded =
          await response.arrayBuffer()

        const buffer =
          await context.decodeAudioData(
            encoded
          )

        if (
          id !== requestId.current
        ) {
          return
        }

        starts.push(duration)
        buffers.push(buffer)

        duration += buffer.duration

        if (
          duration >
          MAX_DURATION_SECONDS
        ) {
          throw new Error(
            'مدة التلاوة تجاوزت 90 ثانية. اختر آيات أقل.'
          )
        }
      }

      if (
        id !== requestId.current
      ) {
        return
      }

      const created: Prepared = {
        verses: chosenVerses,
        buffers,
        starts,
        duration,
      }

      preparedRef.current = created
      setPrepared(created)

      setPosition(0)
      playback.current.position = 0

      setTab(3)
    } catch (cause) {
      if (
        id === requestId.current
      ) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'تعذّر تجهيز التلاوة.'
        )
      }
    } finally {
      if (
        id === requestId.current
      ) {
        setBusy('idle')
        setStatus('')
        preparationAbort.current = null
      }
    }
  }

  function cancelPreparation() {
    requestId.current += 1

    preparationAbort.current?.abort()
    preparationAbort.current = null

    setBusy('idle')
    setStatus('')
  }

  async function toggleAudio() {
    const prep =
      preparedRef.current

    if (
      !prep ||
      working
    ) {
      return
    }

    if (
      playback.current.playing
    ) {
      stopPlayback()
      return
    }

    stopGlobalAudio()

    try {
      if (!audioContext.current) {
        audioContext.current =
          new AudioContext()
      }

      const context =
        audioContext.current

      await context.resume()

      const player =
        playback.current

      if (
        player.position >=
        prep.duration - 0.05
      ) {
        player.position = 0
      }

      const offset =
        player.position

      if (prep.stream) {
        const audio = collectedAudioElement(prep, context)

        await seekCollectedAudio(
          audio,
          prep.stream.startSeconds + offset
        )

        await audio.play()

        player.begin = context.currentTime - offset
        player.playing = true
        setPlaying(true)

        await loopEngine.current?.start()
        return
      }

      const base =
        context.currentTime + 0.08

      player.begin =
        base - offset

      prep.buffers.forEach(
        (buffer, index) => {
          if (
            prep.starts[index] +
              buffer.duration <=
            offset
          ) {
            return
          }

          const node =
            context.createBufferSource()

          node.buffer = buffer

          node.connect(
            context.destination
          )

          node.start(
            base +
              Math.max(
                0,
                prep.starts[index] -
                  offset
              ),
            Math.max(
              0,
              offset -
                prep.starts[index]
            )
          )

          playbackSources.current.push(
            node
          )
        }
      )

      player.playing = true
      setPlaying(true)

      await loopEngine.current?.start()
    } catch {
      setError(
        'تعذّر تشغيل التلاوة. حاول مرة أخرى.'
      )
    }
  }

  async function startExport() {
    const prep =
      preparedRef.current

    const canvas =
      canvasRef.current

    const engine =
      loopEngine.current

    const context =
      audioContext.current

    const backgroundId =
      backgroundRequest.current

    if (
      !prep ||
      !canvas ||
      !engine ||
      !context ||
      working ||
      exportBusy.current
    ) {
      return
    }

    if (
      !canvas.captureStream ||
      typeof MediaRecorder ===
        'undefined'
    ) {
      setError(
        'المتصفح لا يدعم تصدير الفيديو.'
      )
      return
    }

    const mime = [
      'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      'video/mp4',
    ].find(
      (type) =>
        MediaRecorder.isTypeSupported(
          type
        )
    )

    if (!mime) {
      setError(
        'تصدير MP4 غير مدعوم في هذا المتصفح. جرّب إصدارًا حديثًا من Safari.'
      )
      return
    }

    exportBusy.current = true

    const controller =
      new AbortController()

    exportCancel.current =
      () => controller.abort()

    setBusy('export')

    setStatus(
      'جارٍ تجهيز الخلفية قبل إنشاء الفيديو…'
    )

    setProgress(0)
    setError('')
    clearResult()

    stopPlayback(true)
    stopGlobalAudio()

    let recorder:
      MediaRecorder | null = null

    let destination:
      MediaStreamAudioDestinationNode | null =
        null

    // Keep the original recording untouched; fade only its output track.
    let collectedExportGain: GainNode | null = null
    let collectedStopTimer = 0

    let canvasStream:
      MediaStream | null = null

    let recordedStream:
      MediaStream | null = null

    let progressInterval = 0
    let deadline = 0

    const nodes:
      AudioBufferSourceNode[] = []

    try {
      const [started] =
        await Promise.all([
          engine.start({
            signal:
              controller.signal,
          }),
          engine.ready({
            signal:
              controller.signal,
          }),
          context.resume(),
        ])

      if (!started) {
        throw new Error(
          'المتصفح منع تشغيل الخلفية. اضغط تشغيل الخلفية ثم أعد إنشاء الفيديو.'
        )
      }

      if (
        controller.signal.aborted ||
        backgroundId !==
          backgroundRequest.current
      ) {
        throw new Error(
          'تم إلغاء إنشاء الفيديو.'
        )
      }

      setBackgroundReady(true)
      setBackgroundPhase('ready')
      setBackgroundStatus('')

      syncBackgroundPlayback()

      await Promise.all([
        document.fonts.load(
          `24px ${
            fontById(
              design.quranFontId
            ).family
          }`
        ),
        document.fonts.load(
          `24px ${
            fontById(
              design.uiFontId
            ).family
          }`
        ),
      ]).catch(() => [])

      await document.fonts.ready

      if (
        controller.signal.aborted ||
        backgroundId !==
          backgroundRequest.current
      ) {
        throw new Error(
          'تم إلغاء إنشاء الفيديو.'
        )
      }

      await engine.ready({
        signal:
          controller.signal,
      })

      setStatus(
        `جارٍ إنشاء فيديو مدته ${
          durationText(prep.duration)
        }…`
      )

      canvasStream =
        canvas.captureStream(30)

      destination =
        context.createMediaStreamDestination()

      if (prep.stream) {
        const audio = collectedAudioElement(
          prep,
          context
        )

        audio.pause()
        await seekCollectedAudio(
          audio,
          prep.stream.startSeconds
        )

        // Do not start the MP4 recorder before the MP3 has decoded
        // its first playable frames. This reduces silence at the start.
        if (audio.readyState < 3) {
          await new Promise<void>((resolve, reject) => {
            let finished = false
            let timer = 0
            const cleanup = () => {
              audio.removeEventListener('canplay', onReady)
              audio.removeEventListener('error', onError)
              controller.signal.removeEventListener('abort', onAbort)
              window.clearTimeout(timer)
            }
            const done = (failure?: Error) => {
              if (finished) return
              finished = true
              cleanup()
              if (failure) reject(failure)
              else resolve()
            }
            const onReady = () => done()
            const onError = () => done(new Error('تعذر تجهيز الصوت للتصدير.'))
            const onAbort = () => done(new Error('تم إلغاء إنشاء الفيديو.'))
            audio.addEventListener('canplay', onReady)
            audio.addEventListener('error', onError)
            controller.signal.addEventListener('abort', onAbort, { once: true })
            timer = window.setTimeout(
              () => done(new Error('تأخر تحميل صوت العفاسي. حاول مرة أخرى.')),
              15000
            )
            if (controller.signal.aborted) onAbort()
            else if (audio.readyState >= 3) onReady()
          })
        }

        // The MediaElementSource can only have one active output graph.
        // Route it through a gain envelope into MediaRecorder, not speakers.
        const sourceNode = collectedAudioNodeRef.current
        if (!sourceNode) {
          throw new Error('تعذر تجهيز قناة العفاسي الصوتية.')
        }
        collectedExportGain = context.createGain()
        muteEdgeGain(collectedExportGain, context)
        sourceNode.disconnect()
        sourceNode.connect(collectedExportGain)
        collectedExportGain.connect(destination)
      }

      recordedStream =
        new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...destination.stream
            .getAudioTracks(),
        ])

      const mediaRecorder =
        new MediaRecorder(
          recordedStream,
          {
            mimeType: mime,
            videoBitsPerSecond:
              design.quality === 1080
                ? 5_000_000
                : 3_000_000,
            audioBitsPerSecond:
              128_000,
          }
        )

      recorder = mediaRecorder

      const blob =
        await new Promise<Blob>(
          (resolve, reject) => {
            const chunks:
              BlobPart[] = []

            let settled = false
            let requestedStop = false

            const fail = (
              message: string
            ) => {
              if (settled) return

              settled = true

              reject(
                new Error(message)
              )
            }

            const stopRecording = () => {
              if (
                requestedStop ||
                settled
              ) {
                return
              }

              requestedStop = true

              if (
                mediaRecorder.state !==
                'inactive'
              ) {
                try {
                  mediaRecorder
                    .requestData()
                } catch {}

                mediaRecorder.stop()
              }
            }

            exportCancel.current = () => {
              controller.abort()

              fail(
                'تم إلغاء إنشاء الفيديو.'
              )

              if (
                mediaRecorder.state !==
                'inactive'
              ) {
                mediaRecorder.stop()
              }
            }

            mediaRecorder.onerror = () => {
              fail(
                'حدث خطأ أثناء تسجيل MP4.'
              )
            }

            mediaRecorder
              .ondataavailable =
                (event) => {
                  if (
                    event.data.size
                  ) {
                    chunks.push(
                      event.data
                    )
                  }
                }

            mediaRecorder.onstop = () => {
              if (settled) return

              const output = new Blob(
                chunks,
                {
                  type: 'video/mp4',
                }
              )

              if (
                output.size < 3000
              ) {
                fail(
                  'ملف الفيديو الناتج غير صالح.'
                )
                return
              }

              settled = true
              resolve(output)
            }

            // Start capture immediately before audio playback. The audio
            // has already passed canplay above, avoiding a long silent lead.
            try {
              mediaRecorder.start(250)
            } catch {
              fail('تعذر بدء تسجيل MP4 في هذا المتصفح.')
              return
            }

            if (prep.stream) {
              const audio = collectedAudioRef.current

              if (!audio) {
                fail('تسجيل العفاسي غير متاح.')
                return
              }

              // Gain starts muted; the 20-ms ticker gently brings it up.
              muteEdgeGain(collectedExportGain, context)
              void audio.play().catch(() => {
                fail('تعذر تشغيل العفاسي أثناء التصدير.')
              })
            }

            const startedAt =
              context.currentTime +
              (prep.stream ? 0 : 0.12)

            const finishAt =
              startedAt +
              prep.duration

            prep.buffers.forEach(
              (buffer, index) => {
                const node =
                  context
                    .createBufferSource()

                node.buffer = buffer

                node.connect(
                  destination!
                )

                node.start(
                  startedAt +
                    prep.starts[index]
                )

                nodes.push(node)
              }
            )

            const last =
              nodes[
                nodes.length - 1
              ]

            if (last) {
              last.onended = () => {
                window.setTimeout(
                  stopRecording,
                  130
                )
              }
            }

            progressInterval =
              window.setInterval(
                () => {
                  const seconds =
                    prep.stream &&
                    collectedAudioRef.current
                      ? Math.max(
                          0,
                          collectedAudioRef.current.currentTime -
                            prep.stream.startSeconds
                        )
                      : Math.max(
                          0,
                          context.currentTime -
                            startedAt
                        )

                  // Follow the actual streamed MP3 media clock so
                  // buffering does not shift the fade or Quran verse text.
                  if (prep.stream) {
                    updateEdgeGain(
                      collectedExportGain,
                      context,
                      seconds,
                      prep.duration
                    )
                  }

                  exportTime.current =
                    Math.min(
                      prep.duration,
                      seconds
                    )

                  setProgress(
                    Math.min(
                      100,
                      Math.round(
                        (
                          seconds /
                          prep.duration
                        ) * 100
                      )
                    )
                  )

                  if (prep.stream) {
                    if (seconds >= prep.duration && !collectedStopTimer) {
                      // Never let the next verse leak into the output.
                      muteEdgeGain(collectedExportGain, context)
                      collectedAudioRef.current?.pause()
                      // Give the encoder a moment to flush the last samples.
                      collectedStopTimer = window.setTimeout(stopRecording, 120)
                    }
                  } else if (context.currentTime >= finishAt + 0.18) {
                    stopRecording()
                  }
                },
                prep.stream ? 20 : 60
              )

            deadline =
              window.setTimeout(
                () => {
                  fail(
                    'توقف إنشاء الفيديو بسبب انتهاء المهلة. قلل عدد الآيات.'
                  )

                  if (
                    mediaRecorder
                      .state !==
                    'inactive'
                  ) {
                    mediaRecorder.stop()
                  }
                },
                Math.ceil(
                  (
                    prep.duration + (prep.stream ? 25 : 5)
                  ) * 1000
                )
              )
          }
        )

      if (
        !pageMounted.current
      ) {
        return
      }

      const url =
        URL.createObjectURL(blob)

      resultObjectURL.current = url

      setResult({
        url,
        blob,
        filename:
          `samee3-${surah}-${from}-${to}.mp4`,
      })

      setProgress(100)
    } catch (cause) {
      if (
        pageMounted.current
      ) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'تعذّر تصدير الفيديو.'
        )
      }
    } finally {
      exportBusy.current = false

      controller.abort()

      exportTime.current = null
      exportCancel.current = null

      clearInterval(
        progressInterval
      )

      clearTimeout(deadline)
      clearTimeout(collectedStopTimer)

      if (
        recorder &&
        (
          recorder as MediaRecorder
        ).state !== 'inactive'
      ) {
        try {
          ;(
            recorder as MediaRecorder
          ).stop()
        } catch {}
      }

      nodes.forEach((node) => {
        node.onended = null

        try {
          node.stop()
          node.disconnect()
        } catch {}
      })

      recordedStream
        ?.getTracks()
        .forEach(
          (track) => track.stop()
        )

      canvasStream
        ?.getTracks()
        .forEach(
          (track) => track.stop()
        )

      if (prep.stream) {
        collectedAudioRef.current?.pause()

        // Restore ordinary preview playback after the export ends/fails.
        muteEdgeGain(collectedExportGain, context)
        collectedExportGain?.disconnect()

        if (collectedAudioNodeRef.current) {
          try {
            collectedAudioNodeRef.current.disconnect()
            collectedAudioNodeRef.current.connect(
              context.destination
            )
          } catch {}
        }
      }

      destination?.disconnect()

      playback.current.position = 0

      if (
        pageMounted.current
      ) {
        setBusy('idle')
        setStatus('')
        setPosition(0)
        setPlaying(false)
      }
    }
  }

  async function shareResult() {
    if (!result) return

    try {
      const file = new File(
        [result.blob],
        result.filename,
        {
          type: result.blob.type,
        }
      )

      if (
        navigator.canShare?.({
          files: [file],
        })
      ) {
        await navigator.share({
          files: [file],
          title:
            'آيات مرئية — سميع',
        })
      } else {
        setError(
          'حمّل الفيديو أولًا ثم شاركه من جهازك.'
        )
      }
    } catch (cause) {
      if (
        !(
          cause instanceof Error &&
          cause.name ===
            'AbortError'
        )
      ) {
        setError(
          'المشاركة غير مدعومة. استخدم التنزيل.'
        )
      }
    }
  }

  function saveCurrentTemplate() {
    const name =
      customTemplateName.trim()

    if (!name) {
      setError(
        'اكتب اسمًا للقالب أولًا.'
      )
      return
    }

    const item: StoredTemplate = {
      id:
        `custom-${Date.now()}`,
      name,
      design: { ...design },
    }

    persistTemplates([
      item,
      ...customTemplates,
    ])

    setCustomTemplateName('')

    setStatus(
      'تم حفظ القالب المخصص.'
    )
  }

  function deleteCustomTemplate(
    id: string
  ) {
    persistTemplates(
      customTemplates.filter(
        (item) =>
          item.id !== id
      )
    )
  }

  const verseNumbers = useMemo(
    () =>
      verses.map(
        (v) => v.number
      ),
    [verses]
  )

  return (
    <main
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-[#f8f5ec] pb-32 text-[#2b4035]"
    >
      <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
      />

      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />

      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Alexandria:wght@400;700&family=Almarai:wght@400;700&family=Amiri:wght@400;700&family=Amiri+Quran&family=Aref+Ruqaa:wght@400;700&family=Cairo:wght@400;700&family=El+Messiri:wght@400;700&family=IBM+Plex+Sans+Arabic:wght@400;700&family=Lateef&family=Markazi+Text:wght@400;700&family=Noto+Kufi+Arabic:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Reem+Kufi:wght@400;700&family=Scheherazade+New&family=Tajawal:wght@400;700&display=swap"
      />

      <header className="border-b border-[#e7decf] bg-[#fffdf7] px-4 py-5">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <Link
            href="/"
            aria-label="العودة للرئيسية"
            className={secondary}
          >
            <ArrowRight size={19} />
          </Link>

          <div className="flex-1">
            <h1 className="text-xl font-extrabold">
              آيات مرئية
            </h1>

            <p className="mt-1 text-xs text-[#778377]">
              خلفيات متحركة · تلاوات · قوالب قابلة للتخصيص
            </p>
          </div>

          <Film
            className="text-[#a7894d]"
            size={25}
          />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5">
        <nav
          aria-label="خطوات إنشاء الفيديو"
          className="mb-6 grid grid-cols-3 gap-2"
        >
          {[
            'الخلفيات',
            'الآيات والتلاوة',
            'التصميم والحفظ',
          ].map((label, index) => (
            <button
              key={label}
              type="button"
              disabled={
                working ||
                (
                  index === 2 &&
                  !prepared
                )
              }
              onClick={() =>
                setTab(index + 1)
              }
              className={
                'rounded-2xl px-2 py-3 text-xs font-bold ' +
                (
                  tab === index + 1
                    ? 'bg-[#245343] text-white'
                    : 'bg-[#ebe6d8] text-[#64796a]'
                )
              }
            >
              {digits(index + 1)}. {label}
            </button>
          ))}
        </nav>

        {error && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            <p className="flex-1 leading-7">
              {error}
            </p>

            <button
              type="button"
              aria-label="إغلاق التنبيه"
              onClick={() =>
                setError('')
              }
            >
              <X size={17} />
            </button>
          </div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="order-2 space-y-4 lg:order-1">
            {tab === 1 && (
              <>
                <div className={section}>
                  <h2 className="text-xl font-extrabold">
                    مكتبة الخلفيات المتحركة
                  </h2>

                  <p className="mt-2 text-sm leading-7 text-[#6e8071]">
                    اختر فيديو من مكتبة سميع، أو استورد خلفية من جهازك.
                    الفيديوهات تظهر متحركة داخل بطاقات الاختيار.
                  </p>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-[#718274]">
                      {digits(repository.length)} للموقع
                      {' · '}
                      {digits(local.length)} على الجهاز
                    </p>

                    <button
                      type="button"
                      disabled={galleryLoading}
                      className={secondary}
                      onClick={() =>
                        setGalleryRefresh(
                          (x) => x + 1
                        )
                      }
                    >
                      <RefreshCcw
                        size={16}
                        className={
                          galleryLoading
                            ? 'animate-spin'
                            : ''
                        }
                      />
                      تحديث المكتبة
                    </button>
                  </div>

                  {galleryWarning && (
                    <p className="mt-3 text-xs text-amber-700">
                      {galleryWarning}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {groups.map((group) => (
                    <button
                      key={group}
                      type="button"
                      onClick={() =>
                        setCategory(group)
                      }
                      className={
                        'rounded-full px-4 py-2 text-xs font-semibold ' +
                        (
                          category === group
                            ? 'bg-[#245343] text-white'
                            : 'border bg-white'
                        )
                      }
                    >
                      {group}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {shownScenes.map((item) => (
                    <SceneCard
                      key={item.id}
                      item={item}
                      selected={
                        scene.id === item.id
                      }
                      disabled={working}
                      onPick={() =>
                        pickScene(item)
                      }
                    />
                  ))}
                </div>

                <div className={section}>
                  <p className="mb-3 font-bold">
                    الخلفية: {scene.name}
                  </p>

                  <p className="mb-4 text-xs leading-7 text-[#788178]">
                    {backgroundReady
                      ? 'الفيديو جاهز للمعاينة والتصدير.'
                      : backgroundStatus}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <label
                      className={
                        primary +
                        ' cursor-pointer'
                      }
                    >
                      <Upload size={17} />
                      استيراد فيديو من الهاتف

                      <input
                        type="file"
                        className="sr-only"
                        accept=".mp4,.webm,video/mp4,video/webm"
                        onChange={(
                          event: ChangeEvent<HTMLInputElement>
                        ) => {
                          const file =
                            event.target.files?.[0]

                          event.currentTarget.value = ''

                          if (file) {
                            void importVideo(file)
                          }
                        }}
                      />
                    </label>

                    {(
                      backgroundPhase ===
                        'error' ||
                      backgroundPhase ===
                        'needs-play'
                    ) && (
                      <button
                        type="button"
                        disabled={working}
                        className={secondary}
                        onClick={() =>
                          setSceneRefresh(
                            (value) => value + 1
                          )
                        }
                      >
                        <RefreshCcw size={17} />
                        إعادة تحميل الخلفية
                      </button>
                    )}

                    <a
                      href={scene.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={secondary}
                    >
                      <ExternalLink size={17} />
                      المصدر
                    </a>
                  </div>

                  {status && (
                    <p className="mt-3 text-xs leading-6 text-[#5b785e]">
                      {status}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={working}
                  className={
                    primary +
                    ' w-full'
                  }
                  onClick={() =>
                    setTab(2)
                  }
                >
                  التالي: اختيار الآيات
                </button>
              </>
            )}

            {tab === 2 && (
              <div className={section}>
                <h2 className="text-xl font-extrabold">
                  اختر الآيات بالنص أو بالرقم
                </h2>

                <p className="mt-2 text-sm leading-7 text-[#748174]">
                  يمكنك الاختيار من نص الآيات أو بتحديد رقم البداية والنهاية.
                  الحد الأقصى عشر آيات.
                </p>

                <label className="mt-4 block text-sm font-bold">
                  السورة

                  <select
                    className={field}
                    value={surah}
                    disabled={working}
                    onChange={(event) =>
                      changeSurah(
                        Number(
                          event.target.value
                        )
                      )
                    }
                  >
                    {surahs.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                      >
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-4 block text-sm font-bold">
                  القارئ

                  <select
                    className={field}
                    value={reader}
                    disabled={working}
                    onChange={(event) => {
                      invalidatePreparation()

                      setReader(
                        event.target.value
                      )
                    }}
                  >
                    {READERS.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                      >
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="text-sm font-bold">
                    من رقم الآية

                    <select
                      className={field}
                      value={from}
                      disabled={
                        working ||
                        versesLoading
                      }
                      onChange={(event) => {
                        const first =
                          Number(
                            event.target.value
                          )

                        setRange(
                          first,
                          Math.min(
                            Math.max(
                              first,
                              to
                            ),
                            first +
                              MAX_AYAH_COUNT -
                              1
                          )
                        )
                      }}
                    >
                      {verseNumbers.map(
                        (number) => (
                          <option
                            key={`from-${number}`}
                            value={number}
                          >
                            {digits(number)}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="text-sm font-bold">
                    إلى رقم الآية

                    <select
                      className={field}
                      value={to}
                      disabled={
                        working ||
                        versesLoading
                      }
                      onChange={(event) => {
                        const last =
                          Number(
                            event.target.value
                          )

                        setRange(
                          Math.max(
                            1,
                            Math.min(
                              from,
                              last
                            )
                          ),
                          last
                        )
                      }}
                    >
                      {verseNumbers.map(
                        (number) => (
                          <option
                            key={`to-${number}`}
                            value={number}
                          >
                            {digits(number)}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>

                <p className="my-4 rounded-xl bg-[#f5eedb] px-4 py-3 text-sm">
                  من الآية {digits(from)}
                  {' '}إلى الآية {digits(to)}
                  {' · '}
                  {digits(to - from + 1)} آية
                </p>

                {versesLoading && (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm"
                  >
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />
                    جارٍ تحميل نصوص السورة…
                  </p>
                )}

                {versesError && (
                  <div
                    role="alert"
                    className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
                  >
                    {versesError}

                    <button
                      type="button"
                      className="mr-3 underline"
                      onClick={() =>
                        setVersesRefresh(
                          (v) => v + 1
                        )
                      }
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                )}

                <div className="mt-3 max-h-[65vh] space-y-2 overflow-y-auto rounded-xl border border-[#eee8da] p-2">
                  {verses.map((verse) => (
                    <article
                      key={verse.number}
                      className={
                        'rounded-xl border p-3 ' +
                        (
                          verse.number >= from &&
                          verse.number <= to
                            ? 'border-[#ccb17b] bg-[#fff9e9]'
                            : 'border-[#eee9df] bg-white'
                        )
                      }
                    >
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <span className="rounded-full bg-[#f7efdc] px-3 py-1 text-xs font-bold text-[#81642d]">
                          الآية {digits(verse.number)}
                        </span>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={working}
                            className={
                              from === verse.number
                                ? primary
                                : secondary
                            }
                            onClick={() =>
                              chooseFirst(
                                verse.number
                              )
                            }
                          >
                            بداية
                          </button>

                          <button
                            type="button"
                            disabled={working}
                            className={
                              to === verse.number
                                ? primary
                                : secondary
                            }
                            onClick={() =>
                              chooseLast(
                                verse.number
                              )
                            }
                          >
                            نهاية
                          </button>
                        </div>
                      </div>

                      <p
                        className="text-center text-xl leading-[2.6]"
                        style={{
                          fontFamily:
                            '"Amiri Quran",Amiri,serif',
                        }}
                      >
                        {cleanPrefatoryBasmala(
                          verse.text,
                          surah,
                          verse.number
                        )}
                        {' '}

                        <span className="text-[#a98a52]">
                          ﴿{digits(verse.number)}﴾
                        </span>
                      </p>
                    </article>
                  ))}
                </div>

                {busy === 'prepare' ? (
                  <div className="mt-4 space-y-3">
                    <p
                      role="status"
                      className="text-sm"
                    >
                      {status}
                    </p>

                    <button
                      type="button"
                      className={
                        secondary +
                        ' w-full'
                      }
                      onClick={
                        cancelPreparation
                      }
                    >
                      إلغاء تحميل التلاوة
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={
                      primary +
                      ' mt-5 w-full'
                    }
                    disabled={
                      working ||
                      versesLoading ||
                      !chosenVerses.length
                    }
                    onClick={() =>
                      void prepareAudio()
                    }
                  >
                    <Volume2 size={18} />
                    تجهيز التلاوة والمعاينة
                  </button>
                )}
              </div>
            )}

            {tab === 3 && prepared && (
              <div
                className={
                  section +
                  ' space-y-5'
                }
              >
                <h2 className="text-xl font-extrabold">
                  التصميم والمعاينة والحفظ
                </h2>

                <p className="text-sm text-[#6e8274]">
                  {chapter?.name}
                  {' · '}
                  {digits(from)}–{digits(to)}
                  {' · '}
                  {durationText(
                    prepared.duration
                  )}
                </p>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="font-bold">
                      20 قالبًا جاهزًا
                    </h3>

                    <span className="text-xs text-[#728174]">
                      يمكن تعديل أي قالب
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                    {TEMPLATE_PRESETS.map(
                      (preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          disabled={working}
                          className="rounded-2xl border border-[#e5dfd2] bg-[#fffdf8] p-3 text-right"
                          onClick={() =>
                            applyTemplate(
                              preset
                            )
                          }
                        >
                          <div className="mb-2 rounded-xl border border-[#eee4d0] bg-[#faf6eb] px-3 py-2 text-xs font-bold text-[#245343]">
                            {preset.category}
                          </div>

                          <p className="font-bold">
                            {preset.name}
                          </p>

                          <p className="mt-1 text-xs leading-6 text-[#748174]">
                            {preset.description}
                          </p>
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e8e0d1] bg-[#fbfaf6] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold">
                      قوالبك المخصصة
                    </h3>

                    {currentPreset && (
                      <span className="text-xs text-[#748174]">
                        قريب من: {currentPreset.name}
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <input
                      className={
                        field +
                        ' mt-0'
                      }
                      placeholder="اسم القالب المخصص"
                      value={
                        customTemplateName
                      }
                      disabled={working}
                      onChange={(event) =>
                        setCustomTemplateName(
                          event.target.value
                        )
                      }
                    />

                    <button
                      type="button"
                      className={primary}
                      disabled={working}
                      onClick={
                        saveCurrentTemplate
                      }
                    >
                      <Save size={17} />
                      حفظ القالب الحالي
                    </button>
                  </div>

                  {customTemplates.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {customTemplates.map(
                        (item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2 rounded-2xl border border-[#ece3d1] bg-white p-3"
                          >
                            <button
                              type="button"
                              disabled={working}
                              className="flex-1 text-right"
                              onClick={() =>
                                applyTemplate(
                                  item
                                )
                              }
                            >
                              <p className="font-bold">
                                {item.name}
                              </p>

                              <p className="text-xs text-[#728174]">
                                قالب محفوظ
                              </p>
                            </button>

                            <button
                              type="button"
                              className={secondary}
                              disabled={working}
                              onClick={() =>
                                deleteCustomTemplate(
                                  item.id
                                )
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                <details className="rounded-2xl border border-[#e8e0d1] bg-[#fbfaf6] p-4">
                  <summary className="cursor-pointer text-sm font-bold text-[#245343]">
                    تخصيص الخطوط والإطارات والألوان والتفاصيل
                  </summary>

                  <fieldset
                    disabled={working}
                    className="mt-5 space-y-5"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-sm font-bold">
                        مقاس الفيديو

                        <select
                          className={field}
                          value={design.ratio}
                          onChange={(event) =>
                            changeDesign({
                              ratio:
                                event.target.value as
                                  VideoRatio,
                            })
                          }
                        >
                          <option value="9:16">
                            عمودي 9:16
                          </option>

                          <option value="1:1">
                            مربع 1:1
                          </option>

                          <option value="16:9">
                            أفقي 16:9
                          </option>
                        </select>
                      </label>

                      <label className="text-sm font-bold">
                        الدقة

                        <select
                          className={field}
                          value={design.quality}
                          onChange={(event) =>
                            changeDesign({
                              quality:
                                Number(
                                  event.target.value
                                ) as 720 | 1080,
                            })
                          }
                        >
                          <option value={720}>
                            720p
                          </option>

                          <option value={1080}>
                            1080p
                          </option>
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-sm font-bold">
                        خط الآيات

                        <select
                          className={field}
                          value={
                            design.quranFontId
                          }
                          onChange={(event) =>
                            changeDesign({
                              quranFontId:
                                event.target.value,
                            })
                          }
                        >
                          {FONT_OPTIONS.map(
                            (option) => (
                              <option
                                key={option.id}
                                value={option.id}
                              >
                                {option.name}
                              </option>
                            )
                          )}
                        </select>
                      </label>

                      <label className="text-sm font-bold">
                        خط العناوين

                        <select
                          className={field}
                          value={
                            design.uiFontId
                          }
                          onChange={(event) =>
                            changeDesign({
                              uiFontId:
                                event.target.value,
                            })
                          }
                        >
                          {FONT_OPTIONS.map(
                            (option) => (
                              <option
                                key={option.id}
                                value={option.id}
                              >
                                {option.name}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-sm font-bold">
                        نوع الإطار

                        <select
                          className={field}
                          value={
                            design.frameStyle
                          }
                          onChange={(event) =>
                            changeDesign({
                              frameStyle:
                                event.target.value as
                                  VideoDesign[
                                    'frameStyle'
                                  ],
                            })
                          }
                        >
                          <option value="none">
                            بدون إطار
                          </option>

                          <option value="classic">
                            كلاسيكي
                          </option>

                          <option value="double">
                            مزدوج
                          </option>

                          <option value="rounded">
                            مستدير
                          </option>

                          <option value="glow">
                            مضيء
                          </option>

                          <option value="corners">
                            زوايا
                          </option>

                          <option value="top-bottom">
                            علوي وسفلي
                          </option>
                        </select>
                      </label>

                      <label className="text-sm font-bold">
                        نوع لوحة النص

                        <select
                          className={field}
                          value={
                            design.panelStyle
                          }
                          onChange={(event) =>
                            changeDesign({
                              panelStyle:
                                event.target.value as
                                  VideoDesign[
                                    'panelStyle'
                                  ],
                            })
                          }
                        >
                          <option value="glass">
                            زجاجي
                          </option>

                          <option value="solid">
                            مصمت
                          </option>

                          <option value="gradient">
                            متدرج
                          </option>

                          <option value="outline">
                            حد فقط
                          </option>

                          <option value="none">
                            بدون لوحة
                          </option>
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <ColorSetting
                        label="لون الآية"
                        value={
                          design.textColor
                        }
                        onChange={(textColor) =>
                          changeDesign({
                            textColor,
                          })
                        }
                      />

                      <ColorSetting
                        label="لون الإطار"
                        value={
                          design.frameColor
                        }
                        onChange={(frameColor) =>
                          changeDesign({
                            frameColor,
                          })
                        }
                      />

                      <ColorSetting
                        label="لون لوحة الآية"
                        value={
                          design.panelColor
                        }
                        onChange={(panelColor) =>
                          changeDesign({
                            panelColor,
                          })
                        }
                      />

                      <ColorSetting
                        label="لون الطبقة على الفيديو"
                        value={
                          design.overlayColor
                        }
                        onChange={(overlayColor) =>
                          changeDesign({
                            overlayColor,
                          })
                        }
                      />

                      <ColorSetting
                        label="لون عنوان السورة"
                        value={
                          design.titleColor
                        }
                        onChange={(titleColor) =>
                          changeDesign({
                            titleColor,
                          })
                        }
                      />

                      <ColorSetting
                        label="لون اسم القارئ"
                        value={
                          design.readerColor
                        }
                        onChange={(readerColor) =>
                          changeDesign({
                            readerColor,
                          })
                        }
                      />

                      <ColorSetting
                        label="لون التوقيع"
                        value={
                          design.signatureColor
                        }
                        onChange={(signatureColor) =>
                          changeDesign({
                            signatureColor,
                          })
                        }
                      />
                    </div>

                    <RangeSetting
                      label="تعتيم الخلفية"
                      min={0}
                      max={80}
                      value={
                        design.shade
                      }
                      onChange={(shade) =>
                        changeDesign({
                          shade,
                        })
                      }
                    />

                    <RangeSetting
                      label="شفافية لوحة الآية"
                      min={0}
                      max={90}
                      value={
                        design.panelOpacity
                      }
                      onChange={(panelOpacity) =>
                        changeDesign({
                          panelOpacity,
                        })
                      }
                    />

                    <RangeSetting
                      label="طبقة اللون فوق الفيديو"
                      min={0}
                      max={60}
                      value={
                        design.overlayOpacity
                      }
                      onChange={(overlayOpacity) =>
                        changeDesign({
                          overlayOpacity,
                        })
                      }
                    />

                    <RangeSetting
                      label="حجم خط الآية"
                      min={0.7}
                      max={1.35}
                      step={0.05}
                      value={
                        design.fontScale
                      }
                      onChange={(fontScale) =>
                        changeDesign({
                          fontScale,
                        })
                      }
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <RangeSetting
                        label="سمك الإطار"
                        min={1}
                        max={6}
                        value={
                          design.frameWidth
                        }
                        onChange={(frameWidth) =>
                          changeDesign({
                            frameWidth,
                          })
                        }
                      />

                      <RangeSetting
                        label="استدارة الزوايا"
                        min={0}
                        max={50}
                        step={2}
                        value={
                          design.cornerRadius
                        }
                        onChange={(cornerRadius) =>
                          changeDesign({
                            cornerRadius,
                          })
                        }
                      />

                      <RangeSetting
                        label="حجم عنوان السورة"
                        min={0.6}
                        max={1.6}
                        step={0.05}
                        value={
                          design.titleScale
                        }
                        onChange={(titleScale) =>
                          changeDesign({
                            titleScale,
                          })
                        }
                      />

                      <RangeSetting
                        label="حجم اسم القارئ"
                        min={0.6}
                        max={1.6}
                        step={0.05}
                        value={
                          design.readerScale
                        }
                        onChange={(readerScale) =>
                          changeDesign({
                            readerScale,
                          })
                        }
                      />

                      <RangeSetting
                        label="حجم التوقيع"
                        min={0.6}
                        max={1.6}
                        step={0.05}
                        value={
                          design.signatureScale
                        }
                        onChange={(signatureScale) =>
                          changeDesign({
                            signatureScale,
                          })
                        }
                      />

                      <RangeSetting
                        label="مكان الآية رأسيًا"
                        min={32}
                        max={67}
                        value={
                          design.verseVertical
                        }
                        onChange={(verseVertical) =>
                          changeDesign({
                            verseVertical,
                          })
                        }
                      />

                      <RangeSetting
                        label="عرض نص الآية"
                        min={55}
                        max={90}
                        value={
                          design.textWidth
                        }
                        onChange={(textWidth) =>
                          changeDesign({
                            textWidth,
                          })
                        }
                      />

                      <RangeSetting
                        label="تباعد السطور"
                        min={1.3}
                        max={2.3}
                        step={0.05}
                        value={
                          design.lineSpacing
                        }
                        onChange={(lineSpacing) =>
                          changeDesign({
                            lineSpacing,
                          })
                        }
                      />
                    </div>

                    <RangeSetting
                      label="مدة المزج بين تكرارات الخلفية بالثواني"
                      min={0.4}
                      max={2}
                      step={0.1}
                      value={
                        design.loopFade
                      }
                      onChange={(loopFade) =>
                        changeDesign({
                          loopFade,
                        })
                      }
                    />

                    <label className="block text-sm font-bold">
                      التوقيع

                      <input
                        className={field}
                        maxLength={45}
                        value={
                          design.signature
                        }
                        onChange={(event) =>
                          changeDesign({
                            signature:
                              event.target.value,
                          })
                        }
                      />
                    </label>
                  </fieldset>
                </details>

                {busy === 'export' ? (
                  <div
                    role="status"
                    className="space-y-3"
                  >
                    <p className="text-sm">
                      {status}
                      {' '}
                      {digits(progress)}٪
                    </p>

                    <progress
                      className="w-full accent-[#a98b50]"
                      max={100}
                      value={progress}
                    />

                    <button
                      type="button"
                      className={
                        secondary +
                        ' w-full'
                      }
                      onClick={() =>
                        exportCancel.current?.()
                      }
                    >
                      إلغاء الإنشاء
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={
                      primary +
                      ' w-full'
                    }
                    disabled={
                      backgroundPhase ===
                        'loading' ||
                      backgroundPhase ===
                        'error'
                    }
                    onClick={() =>
                      void startExport()
                    }
                  >
                    <Film size={18} />

                    {backgroundPhase === 'loading'
                      ? 'جارٍ تحميل الخلفية…'
                      : 'إنشاء الفيديو بالتلاوة'}
                  </button>
                )}

                {backgroundPhase !== 'ready' && (
                  <div
                    className="space-y-2 text-xs leading-6 text-amber-800"
                    role="status"
                  >
                    <p>
                      {backgroundStatus ||
                        'جارٍ تجهيز الخلفية…'}
                    </p>

                    {(
                      backgroundPhase ===
                        'error' ||
                      backgroundPhase ===
                        'needs-play'
                    ) && (
                      <button
                        type="button"
                        className={secondary}
                        onClick={() =>
                          setSceneRefresh(
                            (value) => value + 1
                          )
                        }
                      >
                        <RefreshCcw size={16} />
                        إعادة تحميل الخلفية
                      </button>
                    )}
                  </div>
                )}

                {result && (
                  <div className="space-y-3 border-t pt-4">
                    <h3 className="font-bold">
                      الفيديو الناتج جاهز
                    </h3>

                    <video
                      src={result.url}
                      controls
                      playsInline
                      className="max-h-80 w-full rounded-xl bg-black"
                    />

                    <div className="flex gap-2">
                      <a
                        className={
                          primary +
                          ' flex-1'
                        }
                        download={
                          result.filename
                        }
                        href={
                          result.url
                        }
                      >
                        <Download size={17} />
                        تنزيل
                      </a>

                      <button
                        type="button"
                        className={secondary}
                        onClick={() =>
                          void shareResult()
                        }
                      >
                        <Share2 size={17} />
                        مشاركة
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="order-1 lg:order-2 lg:sticky lg:top-4">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
              <b>المعاينة الحية</b>

              <span className="truncate text-xs text-[#758473]">
                {scene.name}
              </span>
            </div>

            <div
              className="relative mx-auto max-w-[340px] overflow-hidden rounded-[24px] bg-[#133a33] shadow-lg"
              style={{
                aspectRatio:
                  design.ratio.replace(
                    ':',
                    ' / '
                  ),
              }}
            >
              <video
                ref={videoRef}
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
                onPlay={
                  syncBackgroundPlayback
                }
                onPause={
                  syncBackgroundPlayback
                }
                className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              />

              <video
                ref={loopVideoRef}
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
                onPlay={
                  syncBackgroundPlayback
                }
                onPause={
                  syncBackgroundPlayback
                }
                className="pointer-events-none absolute h-px w-px opacity-0"
              />

              <canvas
                ref={canvasRef}
                aria-label="المعاينة القرآنية المتحركة"
                className="absolute inset-0 h-full w-full"
              />

              {(
                backgroundPhase ===
                  'needs-play' ||
                (
                  backgroundReady &&
                  !backgroundPlaying
                )
              ) && (
                <button
                  type="button"
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-xs font-bold text-white"
                  disabled={
                    backgroundStarting ||
                    working
                  }
                  onClick={() =>
                    void activateBackground()
                  }
                >
                  <Play
                    size={14}
                    className="ml-1 inline"
                  />

                  {backgroundStarting
                    ? 'جارٍ تجهيز الخلفية…'
                    : 'تشغيل الخلفية'}
                </button>
              )}

              {!backgroundReady && (
                <p
                  role="status"
                  className="absolute inset-x-3 top-3 rounded-xl bg-black/75 px-3 py-3 text-center text-xs leading-6 text-white"
                >
                  {backgroundStatus}
                </p>
              )}
            </div>


  {reader === 'alafasy-collected' &&
    prepared?.stream &&
    prepared.collectedOriginal && (
      <Samee3CollectedTrimEditor
        key={reader + ':' + surah + ':' + from + ':' + to}
        surah={surah}
        from={from}
        to={to}
        streamUrl={prepared.stream.url}
        original={prepared.collectedOriginal}
        disabled={working}
        onStop={() => stopPlayback(true)}
        onApply={timing => {
          const current = preparedRef.current

          if (!current?.stream || working) return

          stopPlayback(true)
          clearResult()

          const updated: Prepared = {
            ...current,
            starts: timing.starts,
            duration: timing.duration,
            stream: {
              ...current.stream,
              startSeconds: timing.startSeconds,
            },
          }

          preparedRef.current = updated
          setPrepared(updated)
        }}
      />
    )}

{prepared && (
              <div className="mx-auto mt-3 flex max-w-[340px] items-center gap-3 rounded-2xl bg-white p-3">
                <button
                  type="button"
                  disabled={working}
                  onClick={() =>
                    void toggleAudio()
                  }
                  aria-label={
                    playing
                      ? 'إيقاف التلاوة'
                      : 'تشغيل التلاوة'
                  }
                  className="rounded-full bg-[#245343] p-3 text-white disabled:opacity-50"
                >
                  {playing
                    ? <Pause size={18} />
                    : <Play size={18} />}
                </button>

                <div className="flex-1">
                  <progress
                    className="w-full accent-[#b18e51]"
                    max={
                      prepared.duration
                    }
                    value={
                      position
                    }
                  />

                  <p
                    className="text-center text-xs text-[#758473]"
                    dir="ltr"
                  >
                    {durationText(position)}
                    {' / '}
                    {durationText(
                      prepared.duration
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  className="p-2"
                  disabled={working}
                  onClick={() =>
                    stopPlayback(true)
                  }
                  aria-label="إعادة التلاوة"
                >
                  <RefreshCcw size={17} />
                </button>
              </div>
            )}

            <p className="mt-3 text-center text-xs leading-6 text-[#748075]">
              الخلفية صامتة، والفيديو النهائي يحتوي على صوت التلاوة فقط، من غير موسيقى.
            </p>
          </aside>
        </div>
      </div>
    </main>
  )
}