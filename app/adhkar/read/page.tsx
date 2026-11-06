'use client'

import ShareCardDesigner from '@/components/ShareCardDesigner'
import ReaderPicker from '@/components/adhkar/ReaderPicker'
import RepeatControls from '@/components/adhkar/RepeatControls'
import { adhkarListeningCount, parseAdhkarListening, type AdhkarListeningMode } from '@/lib/adhkar-listening'
import { appAudio, useAppAudio } from '@/lib/app-audio'
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { adhkarCitation, findAdhkarCategory, loadAdhkarCatalog, readCachedAdhkar } from '@/lib/adhkar-catalog'
import {
  downloadAdhkarForOffline,
} from '@/lib/adhkar-offline'
import {
  checkAdhkarRecording,
  findAdhkarReciter,
  findAdhkarRecording,
  findAdhkarCategoryRecording,
  getIndividualAdhkarAudio,
  listAdhkarReciters,
  makeAdhkarAudioUrl,
  type AdhkarRecording,
} from '@/lib/adhkar-reciters'
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  Download,
  Heart,
  Headphones,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
  WifiOff,
  BookmarkCheck,
  Image as ImageIcon,
  Moon,
  Sun,
  Settings2,
  Type as TypeIcon,
  Share2,
  X,
  Minus,
  Plus,
  Info,
  ListFilter,
} from 'lucide-react'

/** SAMEE3 — Adhkar reading page; app/adhkar/read/page.tsx */

type AdhkarType = 'morning' | 'evening' | 'sleep' | 'waking'
type AdhkarItem = {
  id: number
  text: string
  count: number
  audio?: string
  filename?: string
  source?: string
  reference?: string
  benefit?: string
}
type AdhkarCategory = {
  id: number
  category: string
  array: AdhkarItem[]
}
type AudioMode = 'item' | 'section' | null

type ProgressRecord = { counts: Record<string, number>; savedAt: number }

const SETTINGS_KEY = 'samee3_adhkar_read_settings_v1'
const RECITER_KEY = 'samee3_adhkar_reciter'
// Show only readers with an identified audio URL, not source-only or legacy entries.
const RECITERS = listAdhkarReciters({ hasIndividualAudio: true })

const LABELS: Record<AdhkarType, string> = {
  morning: 'أذكار الصباح',
  evening: 'أذكار المساء',
  sleep: 'أذكار النوم',
  waking: 'أذكار الاستيقاظ',
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function categoryFor(categories: AdhkarCategory[], id: number, type: AdhkarType): AdhkarCategory | null {
  if (id > 0) return categories.find((entry) => entry.id === id) ?? null
  return findAdhkarCategory(categories, type)
}

function audioTypeForCategory(name: string, requested: AdhkarType, explicitId: number): AdhkarType | null {
  if (!explicitId) return requested
  if (name.includes('الصباح') && name.includes('المساء')) return requested === 'evening' ? 'evening' : 'morning'
  if (name.includes('الصباح')) return 'morning'
  if (name.includes('المساء')) return 'evening'
  if (name.includes('الاستيقاظ')) return 'waking'
  if (name.includes('النوم')) return 'sleep'
  return null
}

function categoryLabel(name: string, type: AdhkarType, explicitId: number) {
  if (!explicitId) return LABELS[type]
  if (name.includes('الصباح') && name.includes('المساء')) return 'أذكار الصباح والمساء'
  if (name.includes('الصباح')) return LABELS.morning
  if (name.includes('المساء')) return LABELS.evening
  if (name.includes('النوم')) return LABELS.sleep
  if (name.includes('الاستيقاظ')) return LABELS.waking
  return 'أذكار متنوعة'
}

function numberAr(value: number) { return value.toLocaleString('ar-EG') }
function timeLabel(value: number) {
  if (!Number.isFinite(value) || value < 0) return '٠:٠٠'
  const seconds = Math.floor(value)
  return `${numberAr(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0').replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)])}`
}

async function downloadAudio(url: string, signal: AbortSignal, progress: (loaded: number, total: number | null) => void): Promise<void> {
  return downloadAdhkarForOffline(url, signal, progress)
}

async function retryDownloadAudio(url: string, signal: AbortSignal, progress: (loaded: number, total: number | null) => void): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal.aborted) throw new Error('أُوقف التنزيل.')
    try {
      await downloadAudio(url, signal, progress)
      return
    } catch (error) {
      if (signal.aborted || attempt === 2) throw error
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          signal.removeEventListener('abort', cancelled)
          resolve()
        }, 600 * Math.pow(2, attempt))
        const cancelled = () => {
          window.clearTimeout(timer)
          signal.removeEventListener('abort', cancelled)
          reject(new Error('أُوقف التنزيل.'))
        }
        signal.addEventListener('abort', cancelled, { once: true })
      })
    }
  }
}

function localDay(value: number): string {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function readProgress(key: string, items: AdhkarItem[], daily: boolean): Record<number, number> {
  let saved: ProgressRecord | null = null
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || 'null')
    if (isObject(parsed) && isObject(parsed.counts)) {
      saved = parsed as ProgressRecord
    }
  } catch { /* use initial counts */ }
  if (daily && saved && (!Number.isFinite(saved.savedAt) ||
    localDay(saved.savedAt) !== localDay(Date.now()))) {
    saved = null
  }
  const result: Record<number, number> = {}
  items.forEach((item) => {
    const value = Number(saved?.counts?.[String(item.id)])
    result[item.id] = Number.isFinite(value)
      ? Math.max(0, Math.min(item.count, Math.floor(value)))
      : item.count
  })
  return result
}

type ImageTheme = 'ivory' | 'emerald' | 'night'
const IMAGE_PALETTES: Record<ImageTheme, { background: string; ink: string; gold: string; panel: string }> = {
  ivory: { background: '#F8F4ED', ink: '#22424A', gold: '#B79251', panel: '#FFFDFC' },
  emerald: { background: '#123F3D', ink: '#FFFFFF', gold: '#DEC18B', panel: '#1B5350' },
  night: { background: '#132431', ink: '#FFFFFF', gold: '#D6B57B', panel: '#1D3544' },
}

function wrappedCanvasLines(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const result: string[] = []
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean)
    if (!words.length) { result.push(''); continue }
    let line = ''
    for (const word of words) {
      if (context.measureText(word).width > maxWidth) throw new Error('الذكر يحتوي على كلمة طويلة لا تصلح للصورة الحالية.')
      const trial = line ? `${line} ${word}` : word
      if (line && context.measureText(trial).width > maxWidth) {
        result.push(line)
        line = word
      } else { line = trial }
    }
    if (line) result.push(line)
  }
  return result
}

async function shareDhikrImage(item: AdhkarItem, theme: ImageTheme): Promise<void> {
  const palette = IMAGE_PALETTES[theme]
  const canvas = document.createElement('canvas')
  const width = 1080
  canvas.width = width
  const context = canvas.getContext('2d')
  if (!context) throw new Error('المتصفح لا يدعم تصميم الصورة.')
  context.direction = 'rtl'
  context.font = '52px Amiri, Georgia, serif'
  const textLines = wrappedCanvasLines(context, item.text, width - 180)
  const source = item.reference || item.source || 'من مجموعة أذكار حصن المسلم'
  context.font = '28px Tahoma, Arial, sans-serif'
  const sourceLines = wrappedCanvasLines(context, source, width - 190)
  const lineHeight = 93
  const height = 650 + textLines.length * lineHeight + sourceLines.length * 43
  if (height > 7400) throw new Error('النص طويل جدًا لصورة واحدة. استخدم زر نسخ النص كاملًا.')
  canvas.height = height
  context.direction = 'rtl'
  context.fillStyle = palette.background
  context.fillRect(0, 0, width, height)
  context.strokeStyle = palette.gold
  context.lineWidth = 3
  context.strokeRect(38, 38, width - 76, height - 76)
  context.lineWidth = 1
  context.strokeRect(54, 54, width - 108, height - 108)
  context.textAlign = 'center'
  context.fillStyle = palette.gold
  context.font = 'bold 33px Tahoma, Arial, sans-serif'
  context.fillText('مصحف سميع', width / 2, 142)
  context.beginPath()
  context.moveTo(410, 180)
  context.lineTo(670, 180)
  context.strokeStyle = palette.gold
  context.lineWidth = 2
  context.stroke()
  context.fillStyle = palette.ink
  context.font = '52px Amiri, Georgia, serif'
  let y = 290
  for (const line of textLines) {
    context.fillText(line, width / 2, y)
    y += lineHeight
  }
  y += 20
  context.strokeStyle = palette.gold
  context.beginPath()
  context.moveTo(430, y)
  context.lineTo(650, y)
  context.stroke()
  y += 62
  context.fillStyle = palette.gold
  context.font = '28px Tahoma, Arial, sans-serif'
  for (const line of sourceLines) {
    context.fillText(line, width / 2, y)
    y += 43
  }
  context.font = 'bold 24px Tahoma, Arial, sans-serif'
  context.fillText('أذكار وأدعية', width / 2, height - 110)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('تعذّر إنتاج صورة الذكر.')
  const name = `samee3-dhikr-${item.id}.png`
  const file = new File([blob], name, { type: 'image/png' })
  if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'ذكر من مصحف سميع' }); return }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
}

function ReadAdhkarContent() {
  const params = useSearchParams()
  const categoryId = Number(params.get('categoryId') || 0)
  const rawType = params.get('type')
  const type: AdhkarType = rawType === 'evening' || rawType === 'sleep' || rawType === 'waking' ? rawType : 'morning'
  const requestedReader = params.get('reciter') || ''
  const progressKey = `samee3_adhkar_progress_v2_${categoryId || type}`
  const [isDaily, setIsDaily] = useState(false)
  const favoriteKey = `samee3_adhkar_favorites_${categoryId || type}`

  const [reciterId, setReciterId] = useState(RECITERS.some((reader) => reader.id === requestedReader) ? requestedReader : RECITERS[0].id)
  const [items, setItems] = useState<AdhkarItem[]>([])
  const [title, setTitle] = useState(LABELS[type])
  const [audioSectionType, setAudioSectionType] = useState<AdhkarType | null>(categoryId ? null : type)
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [favorites, setFavorites] = useState<number[]>([])
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cachedData, setCachedData] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [activeId, setActiveId] = useState<number | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const playback = useAppAudio()
  const ownsAudio = playback.scope === 'adhkar' && playback.contextKey === progressKey
  const currentTrack = ownsAudio ? playback.queue[playback.index] : undefined
  const audioMode: AudioMode = currentTrack ? currentTrack.itemId === undefined ? 'section' : 'item' : null
  const playing = ownsAudio && playback.playing
  const audioLoading = ownsAudio && playback.loading
  const position = ownsAudio ? playback.position : 0, duration = ownsAudio ? playback.duration : 0
  const muted = playback.muted, speed = playback.rate
  const setMuted = (value: boolean | ((old: boolean) => boolean)) => appAudio.settings({ muted: typeof value === 'function' ? value(appAudio.getSnapshot().muted) : value })
  const setSpeed = (rate: number) => appAudio.settings({ rate })
  const [downloadCount, setDownloadCount] = useState<number | null>(null)
  const [downloadTotal, setDownloadTotal] = useState(0)
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [listeningMode, setListeningMode] = useState<AdhkarListeningMode>('remaining')
  const [repeatInput, setRepeatInput] = useState('3')
  const [viewMode, setViewMode] = useState<'focus' | 'list'>('focus')
  const [focusIndex, setFocusIndex] = useState(0)
  const customRepeats = adhkarListeningCount(repeatInput)
  const [darkMode, setDarkMode] = useState(false)
  const [fontSize, setFontSize] = useState(25)
  const [showMarks, setShowMarks] = useState(true)
  const [onlyFavorites, setOnlyFavorites] = useState(false)
  const [sourceItem, setSourceItem] = useState<AdhkarItem | null>(null)
  const [imageItem, setImageItem] = useState<AdhkarItem | null>(null)
  const [imageTheme, setImageTheme] = useState<'ivory' | 'emerald' | 'night'>('ivory')
  const [makingImage, setMakingImage] = useState(false)

  const itemsRef = useRef<AdhkarItem[]>([])
  const countsRef = useRef<Record<number, number>>({})
  const loadKeyRef = useRef('')
  const readyKeyRef = useRef('')
  const dayRef = useRef(localDay(Date.now()))
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const downloadControllerRef = useRef<AbortController | null>(null)

  // List only reciters with a recording for the *current* section.
  // A recorded book or profile link is not an alternative for a daily section.
  const visibleReciters = RECITERS.filter((reader) => {
    if (audioSectionType && findAdhkarRecording(reader.id, audioSectionType, { allowCombined: true })) return true
    if (categoryId && findAdhkarCategoryRecording(reader.id, categoryId)) return true
    return reader.individualAudio && items.some((item) =>
      Boolean(getIndividualAdhkarAudio(reader.id, item, audioSectionType || undefined)))
  })
  const selectedReader = findAdhkarReciter(
    visibleReciters.some((reader) => reader.id === reciterId)
      ? reciterId
      : visibleReciters[0]?.id || '',
  ) || RECITERS[0]
  const sectionTrack: AdhkarRecording | null = audioSectionType
    ? findAdhkarRecording(selectedReader.id, audioSectionType, { allowCombined: true })
    : categoryId ? findAdhkarCategoryRecording(selectedReader.id, categoryId) : null
  const sectionUrl = sectionTrack ? makeAdhkarAudioUrl(sectionTrack.url) : null
  const itemUrl = (item: AdhkarItem): string =>
    getIndividualAdhkarAudio(selectedReader.id, item, audioSectionType || undefined) || ''
  const recordedItems = selectedReader.individualAudio
    ? items.filter((item) => Boolean(itemUrl(item)))
    : []
  const canPlayItem = recordedItems.length > 0
  const hasAudio = Boolean(sectionUrl || canPlayItem)
  const combinedTrack = sectionTrack?.kind === 'combined-section'
  const [checkState, setCheckState] = useState<'checking' | 'available' | 'unavailable' | 'unknown' | null>(null)
  const complete = items.filter((item) => (counts[item.id] ?? item.count) === 0).length
  const totalRepetitions = items.reduce((sum, item) => sum + item.count, 0)
  const finishedRepetitions = items.reduce((sum, item) => sum + item.count - (counts[item.id] ?? item.count), 0)
  const progress = totalRepetitions ? Math.round(finishedRepetitions / totalRepetitions * 100) : 0
  const activeItem = items.find((item) => item.id === activeId) || null

  useEffect(() => { setCheckState(null) }, [reciterId, audioSectionType])
  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => { countsRef.current = counts }, [counts])
  useEffect(() => {
    if (!ownsAudio) return
    setActiveId(currentTrack?.itemId ?? null)
    const index = itemsRef.current.findIndex(item => item.id === currentTrack?.itemId)
    if (index >= 0) setFocusIndex(index)
    if (Object.keys(playback.counts).length) { countsRef.current = playback.counts; setCounts(playback.counts) }
  }, [ownsAudio, currentTrack, playback.counts, items])
  useEffect(() => { if (ownsAudio && playback.error) setMessage(playback.error) }, [ownsAudio, playback.error])

  const updateCount = useCallback((item: AdhkarItem, value: number) => {
    const next = Math.max(0, Math.min(item.count, value))
    countsRef.current = { ...countsRef.current, [item.id]: next }
    setCounts(countsRef.current)
    appAudio.setCounts(progressKey, countsRef.current)
    return next
  }, [progressKey])

  const stopAudio = useCallback(() => {
    const current = appAudio.getSnapshot()
    if (current.scope === 'adhkar' && current.contextKey === progressKey) appAudio.stop('adhkar')
  }, [progressKey])

  // Navigating away detaches this view. The app owns audio and its sequence.
  useEffect(() => () => { downloadControllerRef.current?.abort() }, [])

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null')
      if (isObject(saved)) {
        const listening = parseAdhkarListening(saved)
        setListeningMode(listening.listeningMode)
        setRepeatInput(String(listening.customRepeats))
        setViewMode(listening.viewMode)
        setDarkMode(saved.darkMode === true)
        setShowMarks(saved.showMarks !== false)
        const size = Number(saved.fontSize)
        if (Number.isInteger(size) && size >= 20 && size <= 34) setFontSize(size)
      }
    } catch { /* optional display preferences */ }
    setSettingsLoaded(true)
  }, [])

  useEffect(() => {
    if (!settingsLoaded) return
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ darkMode, showMarks, fontSize, listeningMode, customRepeats, viewMode })) }
    catch { /* optional display settings */ }
  }, [darkMode, showMarks, fontSize, listeningMode, customRepeats, viewMode, settingsLoaded])

  useEffect(() => {
    try {
      const current = appAudio.getSnapshot()
      if (current.scope === 'adhkar' && current.contextKey === progressKey && current.readerId) setReciterId(current.readerId)
      else if (!requestedReader) {
        const saved = localStorage.getItem(RECITER_KEY)
        if (saved && RECITERS.some((reader) => reader.id === saved)) setReciterId(saved)
      }
      const parsed: unknown = JSON.parse(localStorage.getItem(favoriteKey) || '[]')
      setFavorites(Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [])
    } catch { setFavorites([]) }
  }, [favoriteKey, requestedReader, progressKey])

  useEffect(() => {
    if (!ready || readyKeyRef.current !== progressKey) return
    try { localStorage.setItem(progressKey, JSON.stringify({ counts, savedAt: Date.now() })) } catch { /* storage full */ }
  }, [counts, progressKey, ready])

  useEffect(() => {
    let disposed = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 40000)
    setReady(false)
    setLoading(true)
    setError('')
    setItems([])
    loadKeyRef.current = ''

    const apply = (categories: AdhkarCategory[], cached: boolean) => {
      if (disposed) return false
      const selected = categoryFor(categories, categoryId, type)
      if (!selected) return false
      const daily = selected.category.includes('الصباح') || selected.category.includes('المساء')
      setIsDaily(daily)
      if (loadKeyRef.current !== progressKey) {
        const active = appAudio.getSnapshot()
        const savedCounts = active.scope === 'adhkar' && active.contextKey === progressKey && Object.keys(active.counts).length
          ? active.counts : readProgress(progressKey, selected.array, daily)
        loadKeyRef.current = progressKey
        countsRef.current = savedCounts
        setCounts(savedCounts)
        setActiveId(null)
        const first = selected.array.findIndex(item => (savedCounts[item.id] ?? item.count) > 0)
        setFocusIndex(Math.max(0, first))
      }
      itemsRef.current = selected.array
      setItems(selected.array)
      setTitle(categoryLabel(selected.category, type, categoryId))
      setAudioSectionType(audioTypeForCategory(selected.category, type, categoryId))
      setCachedData(cached)
      readyKeyRef.current = progressKey
      dayRef.current = localDay(Date.now())
      setReady(true)
      setLoading(false)
      return true
    }

    void (async () => {
      const cached = await readCachedAdhkar()
      if (disposed) return
      const foundCached = Boolean(cached?.length && apply(cached, true))
      try {
        const result = await loadAdhkarCatalog({ signal: controller.signal })
        if (!apply(result.categories, result.origin === 'cache' || result.origin === 'local') && !foundCached) {
          throw new Error('Data unavailable')
        }
      } catch {
        if (!disposed && !foundCached) {
          setLoading(false)
          setError('تعذّر تحميل الأذكار. تأكد من وجود /data/adhkar.json أو افتح القسم أثناء الاتصال.')
        }
      } finally { window.clearTimeout(timeout) }
    })()
    return () => { disposed = true; controller.abort(); window.clearTimeout(timeout) }
  }, [categoryId, progressKey, stopAudio, type])

  useEffect(() => {
    if (!isDaily) return
    const refreshDay = () => {
      const today = localDay(Date.now())
      if (dayRef.current === today || !itemsRef.current.length) return
      dayRef.current = today
      stopAudio()
      const reset: Record<number, number> = {}
      itemsRef.current.forEach((item) => { reset[item.id] = item.count })
      countsRef.current = reset
      setCounts(reset)
      setActiveId(null)
      setMessage('بدأ يوم جديد، وتم تجهيز الورد من البداية.')
    }
    window.addEventListener('focus', refreshDay)
    document.addEventListener('visibilitychange', refreshDay)
    const interval = window.setInterval(refreshDay, 60000)
    return () => {
      window.removeEventListener('focus', refreshDay)
      document.removeEventListener('visibilitychange', refreshDay)
      window.clearInterval(interval)
    }
  }, [isDaily, stopAudio])

  const playSource = async (
    url: string, mode: Exclude<AudioMode, null>, index: number, sequential: boolean,
  ) => {
    setMessage('')
    const listenRepeats = listeningMode === 'remaining' ? undefined : listeningMode === 'once' ? 1 : customRepeats
    const queue = mode === 'section' ? [{ url, title, subtitle: selectedReader.name, listenRepeats: listenRepeats || 1 }]
      : items.slice(index, sequential ? undefined : index + 1)
        .filter(item => Boolean(itemUrl(item)) && (!sequential || !onlyFavorites || favorites.includes(item.id)) && (listenRepeats !== undefined || (countsRef.current[item.id] ?? item.count) > 0))
        .map(item => ({ url: itemUrl(item), title: `${title} · الذكر ${numberAr(items.indexOf(item) + 1)}`, subtitle: selectedReader.name,
          itemId: item.id, repetitions: item.count, repeatRemaining: true, listenRepeats }))
    if (!queue.length) { setMessage('اكتمل عدّ هذا الذكر. اختر «مرة واحدة» لإعادة الاستماع أو أعد عدّاده.'); return }
    appAudio.start({ scope: 'adhkar', contextKey: progressKey, readerId: selectedReader.id,
      href: `/adhkar/read?${categoryId ? `categoryId=${categoryId}` : `type=${type}`}&reciter=${encodeURIComponent(selectedReader.id)}`,
      queue, index: 0, counts: countsRef.current, daily: isDaily, repeat: 'off' })
  }

  const startItem = (index: number, sequential = false) => {
    const item = items[index]
    if (!item) return
    const url = itemUrl(item)
    if (!url) return
    setActiveId(item.id)
    setFocusIndex(index)
    void playSource(url, 'item', index, sequential)
  }

  const startSection = () => {
    if (!sectionUrl) return
    setActiveId(null)
    void playSource(sectionUrl, 'section', -1, false)
  }

  const startAll = () => {
    if (canPlayItem) {
      const first = items.findIndex(item => Boolean(itemUrl(item)) && (!onlyFavorites || favorites.includes(item.id)) && (listeningMode !== 'remaining' || (counts[item.id] ?? item.count) > 0))
      if (first >= 0) startItem(first, true)
      else setMessage('انتهت الأذكار المسجّلة. يمكنك إعادة الأعداد للتشغيل من البداية.')
      return
    }
    if (sectionTrack) startSection()
  }

  const togglePlayback = () => {
    if (ownsAudio && audioMode) appAudio.toggle()
    else startAll()
  }

  const changeReciter = (id: string) => {
    if (!RECITERS.some((reader) => reader.id === id)) return
    stopAudio()
    setReciterId(id)
    try { localStorage.setItem(RECITER_KEY, id) } catch { /* ignore */ }
  }

  const changeCount = (item: AdhkarItem) => {
    const remaining = countsRef.current[item.id] ?? item.count
    if (remaining <= 0) return

    // Manual tapping and the onended callback must never count
    // the same audio repetition twice.
    if (audioMode === 'item' && activeId === item.id) {
      stopAudio()
    }

    setActiveId(item.id)
    updateCount(item, remaining - 1)

    // Optional tactile response on supported phones.
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(12)
    }
  }

  const resetOne = (item: AdhkarItem) => {
    stopAudio()
    updateCount(item, item.count)
    setActiveId(item.id)
  }

  const resetAll = () => {
    stopAudio()
    const reset: Record<number, number> = {}
    items.forEach((item) => { reset[item.id] = item.count })
    countsRef.current = reset
    setCounts(reset)
    appAudio.setCounts(progressKey, reset)
    setActiveId(null)
    setMessage('تمت إعادة عدادات الورد إلى البداية.')
  }

  const toggleFavorite = (id: number) => {
    setFavorites((previous) => {
      const next = previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
      try { localStorage.setItem(favoriteKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const copyText = async (item: AdhkarItem) => {
    try {
      await navigator.clipboard.writeText(item.text)
      setCopied(item.id)
      window.setTimeout(() => setCopied(null), 1500)
    } catch { setMessage('تعذّر النسخ. حاول مجددًا.') }
  }

  const saveRecordings = async (mode: 'individual' | 'section' = 'individual') => {
    if (downloadControllerRef.current) return
    const urls = mode === 'section' && sectionUrl ? [sectionUrl]
      : canPlayItem ? Array.from(new Set(items.map(itemUrl).filter(Boolean)))
        : sectionUrl ? [sectionUrl] : []
    if (!urls.length) return
    const controller = new AbortController()
    downloadControllerRef.current = controller
    setDownloadTotal(urls.length)
    setDownloadCount(0)
    setMessage('')
    let succeeded = 0
    let failed = 0
    let failureReason = ''
    setDownloadPercent(0)
    let cursor = 0
    const workers = 1 // Keep only one download open on iPhone.
    try {
      await Promise.all(Array.from({ length: workers }, async () => {
        for (;;) {
          if (controller.signal.aborted) return
          const index = cursor
          cursor += 1
          if (index >= urls.length) return
          try {
            await retryDownloadAudio(urls[index], controller.signal, (loaded, total) => { if (total) setDownloadPercent(Math.min(99, Math.round(loaded / total * 100))) })
            succeeded += 1; setDownloadPercent(100)
          } catch (cause) {
            if (controller.signal.aborted) return
            failed += 1
            failureReason = cause instanceof Error ? cause.name === 'QuotaExceededError' ? 'مساحة التخزين غير كافية. وفّر مساحة على الجهاز وأعد المحاولة.' : cause.message : 'تعذر الاتصال بمصدر التسجيل.'
          }
          if (!controller.signal.aborted) setDownloadCount(succeeded + failed)
        }
      }))
      setMessage(controller.signal.aborted
        ? `تم إيقاف التنزيل. المحفوظ: ${numberAr(succeeded)}.`
        : failed ? `حُفظ ${numberAr(succeeded)} تسجيل وتعذّر حفظ ${numberAr(failed)}. ${failureReason}`
        : 'تم حفظ التسجيلات المتاحة على هذا الجهاز للتشغيل دون إنترنت.')
    } finally {
      downloadControllerRef.current = null
      setDownloadCount(null)
    }
  }


  const readingItems = onlyFavorites
    ? items.filter((item) => favorites.includes(item.id))
    : items
  const focusPosition = Math.max(0, readingItems.findIndex(item => items.indexOf(item) === focusIndex))
  const visibleItems = viewMode === 'list' ? readingItems : readingItems[focusPosition] ? [readingItems[focusPosition]] : []
  const moveFocus = (position: number) => {
    const item = readingItems[position]
    if (!item) return
    setFocusIndex(items.indexOf(item))
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('article[aria-label^="الذكر "]')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  const readingText = (text: string) => showMarks ? text
    : text.replace(/[\u064b-\u065f\u0670]/g, '')

  const completed = useMemo(() => items.filter((item) => (counts[item.id] ?? item.count) === 0), [counts, items])

  return (
    <div dir="rtl" className={`min-h-screen pb-32 ${darkMode ? 'bg-[#13232c] text-white' : 'bg-[#f7f5ef] text-[#183e46]'}`}>
      <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${darkMode ? 'border-white/10 bg-[#13232c]/95' : 'border-[#e7dccb] bg-[#f7f5ef]/95'}`}>
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/adhkar" aria-label="العودة إلى الأذكار" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e7dccb] bg-white text-[#175760] shadow-sm"><ArrowRight size={20} /></Link>
          <div className="min-w-0 text-center"><h1 className="truncate text-lg font-black">{title}</h1><p className={`text-[11px] ${darkMode ? 'text-[#b4c5c1]' : 'text-[#586e6a]'}`}>وردك اليومي</p></div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="إعدادات القراءة" onClick={() => setSettingsOpen((old) => !old)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e7dccb] bg-white text-[#175760]"><Settings2 size={19} /></button>
            <button type="button" aria-label={muted ? 'إلغاء كتم الصوت' : 'كتم الصوت'} onClick={() => setMuted((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e7dccb] bg-white text-[#175760]">{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-5 pb-3">
          <div className="mb-2 flex items-center justify-between text-xs font-bold"><span>الإنجاز — {numberAr(finishedRepetitions)} من {numberAr(totalRepetitions)} تكرارًا</span><span className="text-[#a47f43]">{numberAr(progress)}٪</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-[#e9e1d4]"><div className="h-full rounded-full bg-gradient-to-l from-[#c59c5b] to-[#1a6068] transition-all" style={{ width: `${progress}%` }} /></div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-5 px-4 pt-5 sm:px-5">
        {settingsOpen && <section aria-label="إعدادات القراءة" className={`rounded-[24px] border p-5 shadow-sm ${darkMode ? 'border-white/10 bg-[#203841] text-white' : 'border-[#e9dac2] bg-white'}`}>
          <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-black"><TypeIcon size={18} /> تفضيلات القراءة</h2><button type="button" onClick={() => setSettingsOpen(false)} aria-label="إغلاق الإعدادات"><X size={18} /></button></div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold">حجم الخط</span>
            <button type="button" onClick={() => setFontSize((n) => Math.max(20, n - 2))} aria-label="تصغير خط الأذكار" className="rounded-xl border px-3 py-2"><Minus size={17} /></button>
            <span className="min-w-10 text-center text-sm font-bold">{numberAr(fontSize)}</span>
            <button type="button" onClick={() => setFontSize((n) => Math.min(34, n + 2))} aria-label="تكبير خط الأذكار" className="rounded-xl border px-3 py-2"><Plus size={17} /></button>
            <button type="button" onClick={() => setShowMarks((v) => !v)} className="rounded-xl border border-[#e6d9c6] px-4 py-2 text-xs font-bold">{showMarks ? 'إخفاء التشكيل بصريًا' : 'إظهار التشكيل'}</button>
            <button type="button" onClick={() => setDarkMode((v) => !v)} className="inline-flex items-center gap-2 rounded-xl border border-[#e6d9c6] px-4 py-2 text-xs font-bold">{darkMode ? <Sun size={16} /> : <Moon size={16} />}{darkMode ? 'الوضع الفاتح' : 'وضع القراءة الليلي'}</button>
          </div>
          <p className="mt-3 text-[11px] leading-6 text-slate-500">إخفاء التشكيل يغيّر طريقة العرض فقط؛ النص الأصلي محفوظ بلا تغيير.</p>
        </section>}
        <section className="rounded-[26px] bg-gradient-to-br from-[#245c54] to-[#153f48] p-4 text-white shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-bold text-[#ead3ac]">صوت يرافق وردك</p><span className="text-[11px] text-white/70">{numberAr(recordedItems.length)} من {numberAr(items.length)} ذكرًا مسجّلًا</span></div>
          <ReaderPicker dark={darkMode} value={selectedReader.id} onChange={changeReciter} readers={visibleReciters.map(reader => ({
            id: reader.id, name: reader.name, totalCount: items.length,
            availableCount: items.filter(item => Boolean(getIndividualAdhkarAudio(reader.id, item, audioSectionType || undefined))).length,
            hasComplete: Boolean(audioSectionType ? findAdhkarRecording(reader.id, audioSectionType, {allowCombined:true}) : categoryId && findAdhkarCategoryRecording(reader.id, categoryId)),
          }))}/>
        </section>

        {error && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">{error}<Link href="/adhkar" className="mr-2 font-bold underline">العودة للأذكار</Link></div>}
        {message && <p role="status" className="rounded-2xl border border-[#ddcba8] bg-[#fffaf0] p-4 text-sm leading-7 text-[#786039]">{message}</p>}

        <section aria-label="مشغل الأذكار" className={`rounded-[26px] border p-4 shadow-sm sm:p-5 ${darkMode ? 'border-white/10 bg-[#203841]' : 'border-[#e9dece] bg-white'}`}>
          <div className="mb-4 flex items-center justify-between gap-3"><div><p className={`text-xs font-black ${darkMode ? 'text-[#dfc79b]' : 'text-[#836030]'}`}>المشغّل الصوتي</p><h2 className="mt-1 text-base font-black">{audioMode === 'item' && activeItem ? 'تشغيل الذكر بالتكرار' : canPlayItem ? 'ملفات الأذكار الفردية' : sectionTrack?.title || 'تسجيلات الأذكار'}</h2></div><span className="rounded-full bg-[#f7f1e7] px-3 py-1.5 text-[11px] font-bold text-[#765930]">{audioMode === 'item' ? playback.queue.length > 1 ? 'متتابع' : 'ذكر واحد' : audioMode === 'section' ? 'الورد كاملًا' : 'جاهز'}</span></div>
          <div className="rounded-[22px] bg-[#153f48] p-4 text-white">
            <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-[#ecc993]"><Volume2 size={20} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{selectedReader.name}</p><p className="mt-1 line-clamp-1 text-xs text-white/60">{audioMode === 'item' && activeItem ? activeItem.text : sectionTrack?.title || 'اختر ذكرًا مسجّلًا'}</p></div>
              <button type="button" onClick={togglePlayback} disabled={!hasAudio} aria-label={audioLoading ? 'إيقاف تحميل التسجيل' : playing ? 'إيقاف مؤقت' : 'تشغيل'} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#d9b77d] text-[#163a41] disabled:opacity-40">{audioLoading ? <Loader2 size={19} className="animate-spin" /> : playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
              <button type="button" onClick={stopAudio} disabled={!audioMode} aria-label="إيقاف التسجيل" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 disabled:opacity-30"><Square size={16} fill="currentColor" /></button>
            </div>
            <div className="mt-4 flex items-center justify-between text-[11px] text-white/60"><span>{timeLabel(position)}</span><span>{timeLabel(duration)}</span></div>
            <input aria-label="تغيير موضع التلاوة" type="range" min={0} max={Math.max(duration, 1)} step={1} value={Math.min(position, Math.max(duration, 1))} disabled={!duration || !audioMode} onChange={(event: ChangeEvent<HTMLInputElement>) => { const value = Number(event.target.value); if (ownsAudio && Number.isFinite(value)) appAudio.seek(value) }} className="mt-2 w-full accent-[#d9b77d] disabled:opacity-40" />

          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">{canPlayItem && <button type="button" onClick={startAll} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#245d4e] px-4 text-xs font-bold text-white"><Play size={15}/>{onlyFavorites ? 'تشغيل المفضلة المتاحة' : listeningMode==='remaining' ? 'تشغيل المتبقي من الأذكار' : 'تشغيل كل المتاح'}</button>}{audioMode==='item' && ownsAudio && <span role="status" className="rounded-full bg-[#bca06c]/15 px-3 py-2 text-[11px] font-bold">الاستماع {numberAr(Math.min(playback.playTarget,playback.playCount+(playing||audioLoading?1:0)))} / {numberAr(playback.playTarget)}</span>}</div>
          <details className="mt-3 border-t border-[#bca06c]/20 pt-3"><summary className={`cursor-pointer py-1 text-xs font-bold ${darkMode ? 'text-[#dfc79b]' : 'text-[#836030]'}`}>التكرار والسرعة والتنزيل</summary>
            <RepeatControls mode={listeningMode} value={repeatInput} dark={darkMode} onMode={mode=>{stopAudio();setListeningMode(mode)}} onValue={value=>{stopAudio();setRepeatInput(value)}} onBlur={()=>setRepeatInput(String(customRepeats))}/>
            <div className="mb-3 rounded-2xl bg-[#153f48] p-3 text-white">
            <div className="mt-3 flex items-center justify-between gap-3 text-xs"><span className="text-white/70">السرعة</span><select aria-label="سرعة تشغيل الأذكار" value={speed} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSpeed(Number(event.target.value))} className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-white"><option className="text-black" value={0.85}>0.85×</option><option className="text-black" value={1}>1×</option><option className="text-black" value={1.15}>1.15×</option><option className="text-black" value={1.3}>1.3×</option></select></div>
            </div>
          {hasAudio && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void saveRecordings()} disabled={downloadCount !== null} className="inline-flex items-center gap-2 rounded-xl border border-[#e8d9bf] bg-[#fffaf0] px-4 py-3 text-xs font-bold text-[#85653a]"><Download size={16} />{downloadCount !== null ? `جارٍ الحفظ ${numberAr(downloadCount)} / ${numberAr(downloadTotal)} · ${numberAr(downloadPercent)}٪` : canPlayItem ? 'تنزيل ملفات الأذكار المتاحة دون نت' : 'تنزيل الصوت المتاح دون نت'}</button>{downloadCount !== null && <button type="button" onClick={() => downloadControllerRef.current?.abort()} className="rounded-xl bg-[#fff1ef] px-4 py-3 text-xs font-bold text-red-700">إيقاف التنزيل</button>}</div>}
          {canPlayItem && recordedItems.length < items.length && <p className="mt-3 text-xs leading-7 text-[#7a8b8c]">المتاح بصوت هذا القارئ {numberAr(recordedItems.length)} من {numberAr(items.length)} ذكرًا في هذا الباب. الأذكار الأخرى متاحة للقراءة والعد.</p>}
          {canPlayItem && sectionUrl && <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={startSection} className={`rounded-xl border border-[#e8d9bf] px-3 py-2 text-xs font-bold ${darkMode ? 'text-[#dfc79b]' : 'text-[#765930]'}`}>تشغيل تسجيل الورد كاملًا</button><button type="button" disabled={downloadCount !== null} onClick={() => void saveRecordings('section')} className={`rounded-xl border border-[#e8d9bf] px-3 py-2 text-xs font-bold disabled:opacity-50 ${darkMode ? 'text-[#dfc79b]' : 'text-[#765930]'}`}>تنزيل تسجيل الورد كاملًا</button></div>}

          {combinedTrack && <p className="mb-3 rounded-2xl border border-[#e9d4a9] bg-[#fff8e8] p-3 text-xs leading-6 text-[#806030]">هذا تسجيل واحد يجمع أذكار اليوم والليلة، وليس تسجيلًا مستقلًا لكل من الصباح والمساء. تشغيله لا يحتسب عدّاد أي ذكر تلقائيًا.</p>}
          {sectionTrack && sectionUrl && <div className="mb-3 flex flex-wrap items-center gap-3 text-xs"><span className="text-[#82908c]">حالة رابط التسجيل: {checkState === 'checking' ? 'جارٍ الفحص…' : checkState === 'available' ? 'تم الوصول إلى الصوت' : checkState === 'unavailable' ? 'الرابط غير متاح حاليًا' : checkState === 'unknown' ? 'تعذر التأكد من الرابط' : 'لم يُفحص'}</span><button type="button" disabled={checkState === 'checking'} onClick={() => { setCheckState('checking'); void checkAdhkarRecording(sectionTrack).then((result) => setCheckState(result.status)).catch(() => setCheckState('unknown')) }} className="rounded-xl border border-[#e6d7bf] bg-white px-3 py-2 font-bold text-[#765e3c] disabled:opacity-50">فحص التسجيل</button></div>}
          </details>
          {!hasAudio && <p className="mt-3 text-xs leading-6 text-[#899394]">القارئ المختار لا يتوفر له تسجيل مطابق لهذا القسم حاليًا. يمكنك القراءة والعد بشكل طبيعي.</p>}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">{title}</h2><p className="mt-1 text-xs opacity-60">اقرأ بتأنٍّ، واضغط العدّاد بعد كل مرة تقرؤها بنفسك.</p></div><div role="group" aria-label="طريقة عرض الأذكار" className="inline-flex rounded-xl bg-[#b8a17c]/15 p-1">{([['focus','ذكر واحد'],['list','القائمة']] as const).map(([mode,label])=><button key={mode} type="button" aria-pressed={viewMode===mode} onClick={()=>setViewMode(mode)} className={`min-h-10 rounded-lg px-4 text-xs font-bold ${viewMode===mode?darkMode?'bg-[#245d4e] text-white':'bg-white text-[#245d4e] shadow-sm':'opacity-60'}`}>{label}</button>)}</div></div>
        <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={()=>setOnlyFavorites(v=>!v)} aria-pressed={onlyFavorites} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-bold ${onlyFavorites?'border-[#c4a66d] bg-[#f4ead7] text-[#806239]':darkMode?'border-white/15':'border-[#e4daca] bg-white'}`}><Heart size={15} fill={onlyFavorites?'currentColor':'none'}/>{onlyFavorites?'المفضلة فقط':'عرض المفضلة'}</button><button type="button" onClick={resetAll} disabled={!items.length} className="inline-flex min-h-11 items-center gap-2 px-3 text-xs font-bold opacity-65"><RotateCcw size={15}/>إعادة عدّادات الورد</button></div>
        {viewMode==='focus' && readingItems.length>0 && <nav aria-label="التنقل بين الأذكار" className={`flex items-center justify-between rounded-2xl border p-2 ${darkMode?'border-white/10':'border-[#e5daca] bg-white'}`}><button type="button" disabled={focusPosition===0} onClick={()=>moveFocus(focusPosition-1)} className="min-h-11 rounded-xl px-3 text-xs font-bold disabled:opacity-30">السابق</button><p role="status" className="text-xs font-bold opacity-65">الذكر {numberAr(focusPosition+1)} من {numberAr(readingItems.length)}</p><button type="button" disabled={focusPosition+1>=readingItems.length} onClick={()=>moveFocus(focusPosition+1)} className="min-h-11 rounded-xl px-3 text-xs font-bold disabled:opacity-30">التالي</button></nav>}

        {loading && <div className="flex flex-col items-center justify-center gap-3 py-16"><Loader2 size={32} className="animate-spin text-[#ba965e]" /><p className="text-sm text-[#7a8b8c]">جارٍ تجهيز الأذكار…</p></div>}
        {!loading && !items.length && !error && <div className="rounded-2xl bg-white p-8 text-center text-sm text-[#7a8b8c]">لا توجد أذكار للعرض في هذا القسم.</div>}

        {onlyFavorites && !visibleItems.length && <div className="rounded-2xl border border-[#e5d7bc] bg-white p-7 text-center text-sm text-[#8b7751]">لا توجد أذكار في المفضلة بهذا القسم بعد.</div>}
        <div className="space-y-4">
          {visibleItems.map((item) => {
            const index = items.indexOf(item)
            const remaining = counts[item.id] ?? item.count
            const done = remaining === 0
            const active = activeId === item.id
            const liked = favorites.includes(item.id)
            const itemPlayable = Boolean(itemUrl(item))
            return (
              <article key={`${item.id}-${index}`} aria-label={`الذكر ${numberAr(index+1)}`} className={`scroll-mt-36 rounded-[26px] border p-5 shadow-sm transition sm:p-6 ${darkMode ? 'border-[#435657] bg-[#203841] text-[#f5f1e8]' : done ? 'border-[#b9dbd0] bg-[#f5fbf7]' : active ? 'border-[#c7a56c] bg-white ring-1 ring-[#e8d7b8]' : 'border-[#e9dfd1] bg-white'}`}>
                <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black ${done ? 'bg-[#e4f4e9] text-[#31765d]' : 'bg-[#f4ede1] text-[#987645]'}`}>{done ? <Check size={20} /> : numberAr(index + 1)}</span><div><p className={`text-[11px] ${darkMode ? 'text-[#b4c5c1]' : 'text-[#60736f]'}`}>العدد المطلوب</p><p className="text-sm font-black">{numberAr(item.count)} {item.count === 1 ? 'مرة' : 'مرات'}</p></div></div><button type="button" onClick={() => toggleFavorite(item.id)} aria-label={liked ? 'إزالة من المفضلة' : 'إضافة للمفضلة'} className={`rounded-xl p-2.5 ${liked ? 'bg-red-50 text-red-500' : 'bg-[#f9f6f1] text-[#7f766e]'}`}><Heart size={19} fill={liked ? 'currentColor' : 'none'} /></button></div>
                <p className={`font-uthmani leading-[2.15] ${darkMode ? 'text-[#f9f4e9]' : 'text-[#214349]'} ${done ? 'opacity-75' : ''}`} style={{ fontSize: `${fontSize}px` }}>{readingText(item.text)}</p>

                <div className={`mt-6 flex flex-col items-center gap-3 rounded-[24px] border px-4 py-5 ${darkMode ? 'border-white/10 bg-[#162d35]' : done ? 'border-[#cce3d6] bg-[#eff8f2]' : 'border-[#eee0ca] bg-gradient-to-b from-[#fffcf6] to-[#faf3e7]'}`}>
                  <div className="text-center">
                    <p className={`text-[11px] font-black tracking-wide ${darkMode ? 'text-[#dfc79b]' : 'text-[#987642]'}`}>{done ? 'اكتمل هذا الذكر' : 'عدّاد التكرار'}</p>
                    <p className={`mt-1 text-xs ${darkMode ? 'text-white/60' : 'text-[#788381]'}`}>{done ? `أتممت ${numberAr(item.count)} ${item.count === 1 ? 'مرة' : 'مرات'}` : `اضغط بعد كل مرة — المطلوب ${numberAr(item.count)}`}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => changeCount(item)}
                    disabled={done}
                    aria-label={done ? `اكتمل الذكر رقم ${numberAr(index + 1)}` : `تسجيل تكرار للذكر رقم ${numberAr(index + 1)}، المتبقي ${numberAr(remaining)}، اضغط لتقليل العدد إلى ${numberAr(remaining - 1)}`}
                    title={done ? 'اكتمل الذكر' : 'اضغط لاحتساب تكرار واحد'}
                    className={`group relative flex h-[132px] w-[132px] shrink-0 items-center justify-center rounded-full p-[7px] shadow-[0_12px_32px_rgba(116,84,37,0.17)] transition-transform duration-150 active:scale-[0.94] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#c6a369] disabled:cursor-default disabled:active:scale-100 ${done ? 'shadow-[0_8px_26px_rgba(31,110,83,0.12)]' : ''}`}
                    style={{ background: done ? '#73b89c' : `conic-gradient(#ba9254 ${((item.count - remaining) / item.count) * 100}%, #e7d5b4 0)` }}
                  >
                    <span className={`flex h-full w-full flex-col items-center justify-center rounded-full border-[3px] text-center shadow-inner ${done ? 'border-white bg-[#effaf3] text-[#287758]' : darkMode ? 'border-[#d7bf92] bg-[#203841] text-[#f5dfb2]' : 'border-[#fffaf2] bg-[#fffdf9] text-[#815d2d]'}`}>
                      {done ? (
                        <><CheckCheck size={39} strokeWidth={2.4} /><span className="mt-1 text-xs font-black">تمّ الذكر</span></>
                      ) : (
                        <><span className="text-[11px] font-bold opacity-75">المتبقي</span><span aria-live="polite" aria-atomic="true" className="mt-[-2px] text-[52px] font-black leading-none tabular-nums">{numberAr(remaining)}</span><span className="mt-1 text-[10px] font-bold opacity-75">اضغط للعدّ</span></>
                      )}
                    </span>
                  </button>
                  <div className={`flex w-full max-w-[260px] items-center justify-between gap-3 text-xs font-bold ${darkMode ? 'text-white/70' : 'text-[#796d59]'}`}>
                    <span>أُنجز {numberAr(item.count - remaining)}</span>
                    <span>المطلوب {numberAr(item.count)}</span>
                  </div>
                  <div className={`h-1.5 w-full max-w-[260px] overflow-hidden rounded-full ${darkMode ? 'bg-white/15' : 'bg-[#e8dcc7]'}`}>
                    <div className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-[#4ba17e]' : 'bg-[#b99052]'}`} style={{ width: `${((item.count - remaining) / item.count) * 100}%` }} />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#f0e8dc] pt-4">
                  {itemPlayable && <button type="button" onClick={() => { if (active && audioMode === 'item') togglePlayback(); else startItem(index) }} className="inline-flex items-center gap-1.5 rounded-xl bg-[#175660] px-3 py-2.5 text-xs font-bold text-white">{active && playing && audioMode === 'item' ? <Pause size={16} /> : <Play size={16} />} استمع لهذا الذكر</button>}
                  <button type="button" onClick={() => void copyText(item)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#f5efe5] px-3 py-2.5 text-xs font-bold text-[#80613b]">{copied === item.id ? <CheckCheck size={16} /> : <Copy size={16} />}{copied === item.id ? 'تم النسخ' : 'نسخ'}</button>
                  <button type="button" onClick={() => resetOne(item)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#f5f6f5] px-3 py-2.5 text-xs font-bold text-[#6e7f80]"><RotateCcw size={16} />إعادة</button>
                  <button type="button" onClick={() => setSourceItem(item)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#edf4f1] px-3 py-2.5 text-xs font-bold text-[#396c5b]"><Info size={16} />المصدر</button>
                  <button type="button" onClick={() => setImageItem(item)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#e9f0f5] px-3 py-2.5 text-xs font-bold text-[#345b75]"><ImageIcon size={16} />صورة الذكر</button>
                </div>
              </article>
            )
          })}
        </div>

        {viewMode === 'focus' && readingItems.length > 1 && <nav aria-label="متابعة قراءة الأذكار" className="grid grid-cols-2 gap-3">
          <button type="button" disabled={focusPosition === 0} onClick={() => moveFocus(focusPosition - 1)} className={`flex min-h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-bold disabled:opacity-40 ${darkMode ? 'border-white/15' : 'border-[#e1d6c5] bg-white'}`}><ArrowRight size={17}/>الذكر السابق</button>
          <button type="button" disabled={focusPosition + 1 >= readingItems.length} onClick={() => moveFocus(focusPosition + 1)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#245d4e] text-sm font-bold text-white disabled:opacity-40">الذكر التالي<ArrowRight size={17} className="rotate-180"/></button>
        </nav>}

        {!!items.length && progress === 100 && <section className="rounded-[26px] bg-[#184a52] p-7 text-center text-white shadow-lg"><CheckCheck size={43} className="mx-auto text-[#e9c68e]" /><h2 className="mt-3 text-2xl font-black">تقبّل الله طاعتكم</h2><p className="mt-2 text-sm text-white/70">أتممت {title} كاملًا.</p><Link href="/adhkar" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#184a52]"><BookOpen size={18} />العودة إلى الأذكار</Link></section>}
        {sourceItem && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onClick={() => setSourceItem(null)}>
          <section role="dialog" aria-modal="true" aria-label="مصدر الذكر" onClick={(event: MouseEvent<HTMLElement>) => event.stopPropagation()} className="w-full max-w-lg rounded-[25px] bg-[#fffdf8] p-6 text-[#1c4146] shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-black"><BookmarkCheck className="text-[#b28d52]" size={22} /> المصدر والفضل</h2><button type="button" onClick={() => setSourceItem(null)} aria-label="إغلاق"><X size={20} /></button></div>
            <p className="mt-4 text-sm leading-8">{adhkarCitation(sourceItem).reference || adhkarCitation(sourceItem).source || adhkarCitation(sourceItem).clarification}</p>
            {sourceItem.benefit && <div className="mt-4 rounded-xl bg-[#f7f0e5] p-4"><h3 className="text-sm font-black">الفضل</h3><p className="mt-2 text-sm leading-7">{sourceItem.benefit}</p></div>}
            {!sourceItem.benefit && <p className="mt-3 text-xs leading-6 text-[#8b785c]">لا يتوفر شرح أو فضل موثّق بصورة منفصلة لهذا الذكر في البيانات الحالية.</p>}
            {(sourceItem.source || sourceItem.reference) && <p className="mt-3 text-xs leading-6 text-[#8b785c]">{adhkarCitation(sourceItem).clarification}</p>}
          </section>
        </div>}
        {imageItem && <ShareCardDesigner content={{ kind: 'dhikr', title: 'ذكر ودعاء', text: imageItem.text, reference: imageItem.reference || 'أذكار المسلم' }} onClose={() => setImageItem(null)} />}
      </main>
    </div>
  )
}

export default function ReadAdhkarPage() {
  return (
    <Suspense fallback={<div dir="rtl" className="flex min-h-screen items-center justify-center bg-[#f7f5ef] text-[#175660]"><Loader2 size={34} className="animate-spin" /></div>}>
      <ReadAdhkarContent />
    </Suspense>
  )
}
