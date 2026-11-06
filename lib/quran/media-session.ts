import { RIWAYAT, SURAH_NAMES_AR, type RiwayaId } from './Samee3DataAdapter'
import { createMediaArtwork } from './media-artwork'
import { bindAudioFocus } from '../audio-focus'
import { currentMediaDhikr, parseMediaDhikrs, type AdhkarMedia, type MediaDhikr } from '../adhkar-media'

type Timing = { ayah?: number; start_time?: number; end_time?: number }

export type MediaTrack = {
  kind: 'quran' | 'library' | 'adhkar'
  title: string
  subtitle: string
  audioUrl: string
  reciterName: string
  surahId?: number
  riwayaId?: number
  moshafId?: number
  isStream?: boolean
  adhkar?: AdhkarMedia
  next?: () => void
  previous?: () => void
  play?: () => void
  pause?: () => void
}

type QuranAudio = HTMLMediaElement & {
  __samee3NetworkUrl?: string
  __samee3Surah?: number
  __samee3Riwaya?: RiwayaId
  __samee3ReciterName?: string
  __samee3MoshafId?: number | null
  __samee3Timings?: Timing[]
  __samee3Continue?: boolean
  __samee3Serial?: number
  __samee3Switching?: boolean
}

type Entry = {
  audio: QuranAudio
  track?: MediaTrack
  key: string
  metadataKey: string
  texts: Map<number, string>
  timings: Timing[]
  dhikrs: MediaDhikr[]
  controller?: AbortController
  artworkKey: string
  artworkUrl?: string
}

const entries = new WeakMap<HTMLMediaElement, Entry>()
const CACHE = 'samee3-media-session-v1'
let active: Entry | null = null
let installed = false

function fold(value: string) {
  return value.replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim()
}

export function riwayaFromName(name: string): RiwayaId | undefined {
  const value = fold(name)
  return RIWAYAT.find((item) => value.includes(fold(item.label)))?.id
}

/** The recording's own ayah numbers are used, including non-Hafs counts. */
export function currentMediaAyah(rows: Timing[], seconds: number, duration: number): number | null {
  if (!Number.isFinite(seconds) || seconds < 0) return null
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index]
    const start = Number(row.start_time) / 1000
    if (!Number.isFinite(start) || seconds < start) continue
    const next = Number(rows[index + 1]?.start_time) / 1000
    const declaredEnd = Number(row.end_time) / 1000
    const end = Number.isFinite(declaredEnd) && declaredEnd > start
      ? Math.min(declaredEnd, Number.isFinite(next) ? next : Infinity)
      : Number.isFinite(next) ? next : duration
    return seconds < end && Number.isInteger(row.ayah) && Number(row.ayah) > 0
      ? Number(row.ayah) : null
  }
  return null
}

function timingRows(value: unknown): Timing[] {
  const data = value as { ayat_timing?: unknown; data?: unknown } | null
  const rows = Array.isArray(value) ? value : data?.ayat_timing ?? data?.data
  if (!Array.isArray(rows)) return []
  return rows.map((row) => ({
    ayah: Number(row?.ayah), start_time: Number(row?.start_time),
    end_time: row?.end_time == null ? undefined : Number(row.end_time),
  })).filter((row) => Number.isInteger(row.ayah) && row.ayah > 0 &&
    Number.isFinite(row.start_time) && row.start_time >= 0)
    .sort((a, b) => a.start_time - b.start_time)
}

function sourceKey(value: string): string {
  try {
    const url = new URL(value, location.href)
    if (url.pathname === '/api/audio-proxy') {
      const source = url.searchParams.get('url')
      return source && source !== value ? sourceKey(source) : ''
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  } catch { return value }
}

/** Older saved library items lack moshafId; use an exact cached server match. */
function cachedReadId(track: MediaTrack): number {
  if (Number.isInteger(track.moshafId) && Number(track.moshafId) > 0) return Number(track.moshafId)
  if (!track.riwayaId || !track.surahId || !track.audioUrl) return 0
  try {
    const url = `https://mp3quran.net/api/v3/reciters?language=ar&rewaya=${track.riwayaId}`
    const data = JSON.parse(localStorage.getItem(`samee3_audio_api_v1:${url}`) || '{}')
    for (const reciter of Array.isArray(data.reciters) ? data.reciters : []) {
      for (const mushaf of Array.isArray(reciter.moshaf) ? reciter.moshaf : []) {
        const expected = `${String(mushaf.server || '').replace(/\/?$/, '/')}${String(track.surahId).padStart(3, '0')}.mp3`
        if (sourceKey(expected) === sourceKey(track.audioUrl) &&
          (!mushaf.rewaya_id || Number(mushaf.rewaya_id) === track.riwayaId)) return Number(mushaf.id) || 0
      }
    }
  } catch { /* Missing cached metadata must not interrupt audio. */ }
  return 0
}

function describe(entry: Entry) {
  const { audio, track } = entry
  const surah = Number(track ? track.surahId : audio.__samee3Surah) || 0
  const riwaya = track ? riwayaFromName(track.subtitle) : audio.__samee3Riwaya
  const definition = RIWAYAT.find((item) => item.id === riwaya)
  const quran = track ? track.kind === 'quran' : Boolean(definition && surah)
  return {
    quran, surah, riwaya: definition?.id,
    read: track ? cachedReadId(track) : Number(audio.__samee3MoshafId) || 0,
    title: quran && SURAH_NAMES_AR[surah - 1] ? `سورة ${SURAH_NAMES_AR[surah - 1]}` : track?.title || 'تلاوة القرآن الكريم',
    reciter: track?.reciterName || audio.__samee3ReciterName || '',
    label: track?.subtitle || definition?.label || '',
    source: track?.audioUrl || audio.__samee3NetworkUrl || audio.src,
    adhkar: track?.kind === 'adhkar' ? track.adhkar : undefined,
  }
}

async function cachedJson(url: string, signal: AbortSignal): Promise<unknown> {
  let cache: Cache | undefined
  try {
    cache = await caches.open(CACHE)
    const saved = await cache.match(url)
    if (saved?.ok) return await saved.json()
  } catch { /* Private browsing may disable Cache Storage. */ }
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal.aborted) controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 12000)
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'force-cache' })
    if (!response.ok) throw new Error('Media metadata unavailable')
    const data: unknown = await response.clone().json()
    if (cache && !signal.aborted) void cache.put(url, response).catch(() => undefined)
    return data
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

/** Save known chapter metadata alongside a complete audio download when available. */
export async function prepareAdhkarMedia(recordingId: string, signal: AbortSignal): Promise<void> {
  await cachedJson(`/api/adhkar/v1/sections/${encodeURIComponent(recordingId)}/timings`, signal)
}

async function loadTimings(read: number, surah: number, signal: AbortSignal) {
  if (!read) return []
  try {
    const saved = timingRows(JSON.parse(localStorage.getItem(`samee3_ayah_timing_v3:${read}:${surah}`) || 'null'))
    if (saved.length) return saved
  } catch { /* Try the public timing endpoint. */ }
  return timingRows(await cachedJson(`https://mp3quran.net/api/v3/ayat_timing?surah=${surah}&read=${read}`, signal))
}

function refreshData(entry: Entry, info: ReturnType<typeof describe>) {
  entry.controller?.abort()
  entry.controller = new AbortController()
  entry.texts.clear()
  entry.timings = []
  entry.dhikrs = []
  entry.artworkKey = ''
  entry.artworkUrl = undefined
  const signal = entry.controller.signal
  const key = entry.key
  if (info.adhkar?.recordingId) {
    const recordingId = info.adhkar.recordingId
    void cachedJson(`/api/adhkar/v1/sections/${encodeURIComponent(recordingId)}/timings`, signal).then(value => {
      const result = value as { recording?: { id?: string }; items?: unknown }
      if (signal.aborted || entry.key !== key || result.recording?.id !== recordingId) return
      entry.dhikrs = parseMediaDhikrs(result.items)
      if (active === entry) handlers(true)
      sync(entry)
    }).catch(() => undefined)
    return
  }
  if (!info.quran || !info.riwaya || info.surah < 1 || info.surah > 114) return
  void cachedJson(`/api/quran-now-playing?riwaya=${info.riwaya}&surah=${info.surah}`, signal).then((value) => {
    const data = value as { riwaya?: string; surah?: number; ayahs?: { number: number; text: string }[] }
    if (signal.aborted || entry.key !== key || data.riwaya !== info.riwaya || data.surah !== info.surah) return
    for (const row of Array.isArray(data.ayahs) ? data.ayahs : []) {
      if (Number.isInteger(row.number) && row.number > 0 && typeof row.text === 'string' && row.text.trim()) {
        entry.texts.set(row.number, row.text.trim())
      }
    }
    sync(entry)
  }).catch(() => undefined)
  void loadTimings(info.read, info.surah, signal).then((rows) => {
    if (signal.aborted || entry.key !== key) return
    entry.timings = rows
    sync(entry)
  }).catch(() => undefined)
}

function position(audio: HTMLMediaElement) {
  try {
    if (!navigator.mediaSession.setPositionState) return
    if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.readyState < 1) {
      navigator.mediaSession.setPositionState()
      return
    }
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: Number.isFinite(audio.playbackRate) && audio.playbackRate > 0 ? audio.playbackRate : 1,
      position: Math.min(audio.duration, Math.max(0, Number.isFinite(audio.currentTime) ? audio.currentTime : 0)),
    })
  } catch { /* Older Safari versions may expose only part of Media Session. */ }
}

function sync(entry: Entry) {
  const { audio } = entry
  if (!audio.getAttribute('src') && !audio.querySelector('source[src]')) {
    entry.controller?.abort()
    entry.key = ''
    release(entry)
    return
  }
  const info = describe(entry)
  const key = JSON.stringify([audio.src, info.source, info.surah, info.riwaya, info.read, info.title, info.reciter, info.label, info.adhkar])
  if (entry.key !== key) {
    entry.key = key
    entry.metadataKey = ''
    refreshData(entry, info)
  }
  if (active !== entry) return
  const rows = !entry.track && audio.__samee3Timings?.length ? audio.__samee3Timings : entry.timings
  const ayah = info.quran && !audio.__samee3Switching && audio.readyState >= 1
    ? currentMediaAyah(rows, audio.currentTime, audio.duration) : null
  const dhikr = info.adhkar?.text
    ? { text: info.adhkar.text, number: info.adhkar.number || 1 }
    : info.adhkar && audio.readyState >= 1 ? currentMediaDhikr(entry.dhikrs, audio.currentTime) : null
  const text = dhikr?.text || (ayah ? entry.texts.get(ayah) : undefined)
  const numberAr = (number: number) => String(number).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)])
  const title = dhikr
    ? `الذكر ${numberAr(dhikr.number)} · ${dhikr.text.replace(/\s+/g, ' ').trim()}`
    : text && ayah
    ? `الآية ${String(ayah).replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)])}`
    : info.title
  if (text && (ayah || dhikr)) {
    const artworkInput = { text, surah: info.adhkar?.section || info.title, ayah: dhikr?.number || ayah!,
      reciter: info.reciter, riwaya: dhikr ? 'أذكار سميع' : info.label,
      kind: dhikr ? 'adhkar' as const : 'quran' as const,
      total: dhikr ? info.adhkar?.total || entry.dhikrs.length || undefined : undefined }
    const artworkKey = JSON.stringify([entry.key, artworkInput])
    if (entry.artworkKey !== artworkKey) {
      entry.artworkKey = artworkKey
      entry.artworkUrl = undefined
      void createMediaArtwork(artworkInput).then((url) => {
        if (entry.artworkKey !== artworkKey) return
        entry.artworkUrl = url
        entry.metadataKey = ''
        if (active === entry) sync(entry)
      }).catch(() => undefined)
    }
  } else {
    entry.artworkKey = ''
    entry.artworkUrl = undefined
  }
  const artist = [info.reciter, info.label, info.quran ? info.title : ''].filter(Boolean).join(' • ')
  const metadataKey = JSON.stringify([title, artist, info.title, entry.artworkKey, Boolean(entry.artworkUrl)])
  try {
    if (metadataKey !== entry.metadataKey && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title, artist, album: info.title,
        artwork: entry.artworkUrl ? [{ src: entry.artworkUrl, sizes: '1024x1024', type: 'image/png' }] : [192, 512].map((size) => ({
          src: new URL(`/icon-${size}.png`, location.origin).href,
          sizes: `${size}x${size}`, type: 'image/png',
        })),
      })
      entry.metadataKey = metadataKey
    }
    navigator.mediaSession.playbackState = audio.paused || audio.ended ? 'paused' : 'playing'
  } catch { /* Playback must remain usable without metadata support. */ }
  position(audio)
}

function setIntent(audio: QuranAudio, playing: boolean) {
  if (!('__samee3Continue' in audio)) return
  audio.__samee3Continue = playing
  audio.__samee3Serial = Number(audio.__samee3Serial || 0) + 1
  audio.__samee3Switching = false
}

function handlers(enabled: boolean) {
  const seek = (seconds: number) => {
    const audio = active?.audio
    if (!audio || !Number.isFinite(seconds) || !Number.isFinite(audio.duration) || audio.duration <= 0) return
    try { audio.currentTime = Math.max(0, Math.min(audio.duration, seconds)) } catch { return }
    if (active) sync(active)
  }
  const nextDhikr = (offset: number) => {
    const entry = active
    if (!entry) return
    if (entry.track?.kind === 'adhkar' && entry.dhikrs.length) {
      const at = entry.audio.currentTime * 1000
      const current = currentMediaDhikr(entry.dhikrs, entry.audio.currentTime)
      const target = offset > 0 ? entry.dhikrs.find(row => row.startMs > at + 50)
        : [...entry.dhikrs].reverse().find(row => row.startMs < (current?.startMs ?? at) - 50)
      if (target) { seek(target.startMs / 1000); return }
    }
    if (offset > 0) entry.track?.next?.()
    else entry.track?.previous?.()
  }
  const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => {
      const entry = active
      if (!entry) return
      if (entry.track?.play) { entry.track.play(); return }
      setIntent(entry.audio, true)
      void entry.audio.play().catch(() => { setIntent(entry.audio, false); sync(entry) })
    }],
    ['pause', () => { if (active?.track?.pause) active.track.pause(); else if (active) { setIntent(active.audio, false); active.audio.pause(); sync(active) } }],
    ['stop', () => { if (active?.track?.pause) active.track.pause(); else if (active) { setIntent(active.audio, false); active.audio.pause(); sync(active) } }],
    ['seekbackward', (event) => seek((active?.audio.currentTime || 0) - (event.seekOffset || 10))],
    ['seekforward', (event) => seek((active?.audio.currentTime || 0) + (event.seekOffset || 10))],
    ['seekto', (event) => { if (typeof event.seekTime === 'number') seek(event.seekTime) }],
    ['nexttrack', () => nextDhikr(1)],
    ['previoustrack', () => nextDhikr(-1)],
  ]
  for (const [action, handler] of actions) {
    const timedDhikrs = active?.track?.kind === 'adhkar' && active.dhikrs.length > 1
    const available = enabled && (action === 'nexttrack' ? Boolean(active?.track?.next || timedDhikrs)
      : action === 'previoustrack' ? Boolean(active?.track?.previous || timedDhikrs) : true)
    try { navigator.mediaSession.setActionHandler(action, available ? handler : null) } catch { /* Unsupported action. */ }
  }
}

function release(entry: Entry) {
  if (active !== entry) return
  active = null
  try {
    handlers(false)
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
    navigator.mediaSession.setPositionState?.()
  } catch { /* Browser may be disposing the document. */ }
}

/** Bind the existing element; no second player, timers, or changes to its source. */
export function bindQuranMediaSession(element: HTMLMediaElement, track?: MediaTrack): void {
  if (typeof window !== 'undefined') bindAudioFocus(element)
  if (typeof window === 'undefined' || !('mediaSession' in navigator)) return
  let entry = entries.get(element)
  if (entry) {
    entry.track = track
    sync(entry)
    if (active === entry) handlers(true)
    return
  }
  entry = { audio: element as QuranAudio, track, key: '', metadataKey: '', texts: new Map(), timings: [], dhikrs: [], artworkKey: '' }
  entries.set(element, entry)
  const bound = entry
  const update = () => sync(bound)
  const activate = () => {
    if (active !== bound) {
      active = bound
      bound.metadataKey = ''
      handlers(true)
    }
    sync(bound)
  }
  const emptied = () => {
    if (element.getAttribute('src') || element.querySelector('source[src]')) { sync(bound); return }
    bound.controller?.abort()
    bound.key = ''
    release(bound)
  }
  element.addEventListener('play', activate)
  element.addEventListener('playing', activate)
  element.addEventListener('emptied', emptied)
  for (const event of ['timeupdate', 'seeked', 'seeking', 'pause', 'ended', 'error', 'ratechange', 'durationchange', 'loadedmetadata', 'loadstart']) {
    element.addEventListener(event, update)
  }
  if (!installed) {
    installed = true
    document.addEventListener('play', (event) => {
      if (active && event.target instanceof HTMLMediaElement && event.target !== active.audio && !entries.has(event.target)) release(active)
    }, true)
    document.addEventListener('visibilitychange', () => { if (active) sync(active) })
    window.addEventListener('pageshow', () => { if (active) sync(active) })
  }
  if (!element.paused && !element.ended) activate()
  else update()
}
