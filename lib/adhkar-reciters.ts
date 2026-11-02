/**
 * SAMEE3 — سجل قارئي الأذكار والتسجيلات البشرية.
 *
 * لا تُعرض أسماء ليست لها تسجيلات مرتبطة بالقسم المختار.
 * لا تُستبدل تسجيلات وردٍ كامل بصوت ذكرٍ منفرد من قارئ مختلف.
 * هذه القائمة تثبت وجود رابط مصدر محدد، وليست ضمانًا لتوافر الخادم دائمًا.
 */
export type AdhkarDailyType = 'morning' | 'evening' | 'sleep' | 'waking'
export type AdhkarRecordingType = AdhkarDailyType | 'day-and-night'
export type AdhkarRecordingSource = 'tvquran' | 'islamhouse' | 'adhkar-json'

export interface AdhkarRecording {
  id: string
  title: string
  type: AdhkarRecordingType
  url: string
  source: AdhkarRecordingSource
  sourcePage: string
  kind: 'complete-section' | 'combined-section'
}

export interface AdhkarReciter {
  id: string
  name: string
  sourcePage: string
  individualAudio: boolean
  recordings: readonly AdhkarRecording[]
  legacyOnly?: boolean
}

export type AdhkarAudioCheck =
  | { status: 'available'; statusCode: number }
  | { status: 'unavailable'; statusCode: number }
  | { status: 'unknown'; reason: string }

const TVQURAN_AUDIO =
  'https://download.tvquran.com/download/TvQuran.com__Athkar'
const TVQURAN_SELECTION = 'https://www.tvquran.com/ar/selection'
const ISLAMHOUSE_HAMAD = 'https://islamhouse.com/ar/audios/263352/'
const ISLAMHOUSE_SULAIMAN = 'https://islamhouse.com/ar/audios/2799103/'
const ITEM_AUDIO_SOURCE = 'https://cdn.jsdelivr.net/gh/rn0x/Adhkar-json@main'
const ALLOWED_EXTENSIONS = /\.(?:mp3|m4a|aac|ogg|wav)$/i

function tvquran(
  id: string,
  title: string,
  type: AdhkarRecordingType,
  selection: number,
): AdhkarRecording {
  const filename = `TvQuran.com_athkar_${String(selection).padStart(2, '0')}.mp3`
  return {
    id,
    title,
    type,
    url: `${TVQURAN_AUDIO}/${filename}`,
    source: 'tvquran',
    sourcePage: `${TVQURAN_SELECTION}/${selection}/embeddable`,
    kind: type === 'day-and-night' ? 'combined-section' : 'complete-section',
  }
}

/**
 * الأسماء ذات التسجيلات الجزئية غير المرتبطة بروابط MP3 مؤكدة لا تظهر
 * في قوائم التشغيل، ويمكن إضافتها لاحقًا بعد توثيق روابطها الفعلية.
 */
export const ADHKAR_RECITERS: readonly AdhkarReciter[] = [
  {
    id: 'mishary-alafasy',
    name: 'مشاري بن راشد العفاسي',
    sourcePage: 'https://www.tvquran.com/ar/scholar/85/profile',
    individualAudio: false,
    recordings: [
      tvquran('mishary-waking', 'أذكار الاستيقاظ', 'waking', 1),
      tvquran('mishary-morning', 'أذكار الصباح', 'morning', 3),
      tvquran('mishary-evening', 'أذكار المساء', 'evening', 4),
      tvquran('mishary-sleep', 'أذكار النوم', 'sleep', 11),
    ],
  },
  {
    id: 'faris-abbad',
    name: 'فارس عباد',
    sourcePage: 'https://www.tvquran.com/ar/scholar/64/profile',
    individualAudio: false,
    recordings: [
      tvquran('faris-morning', 'أذكار الصباح', 'morning', 5),
      tvquran('faris-evening', 'أذكار المساء', 'evening', 6),
    ],
  },
  {
    id: 'mohamed-jibril',
    name: 'محمد جبريل',
    sourcePage: 'https://www.tvquran.com/ar/selections/category/8',
    individualAudio: false,
    recordings: [
      tvquran('jibril-morning', 'أذكار الصباح', 'morning', 7),
      tvquran('jibril-evening', 'أذكار المساء', 'evening', 8),
    ],
  },
  {
    id: 'nasser-alqatami',
    name: 'ناصر القطامي',
    sourcePage: 'https://www.tvquran.com/ar/selection/2/embeddable',
    individualAudio: false,
    recordings: [
      tvquran('nasser-day-night', 'أذكار اليوم والليلة', 'day-and-night', 2),
    ],
  },
  {
    id: 'hamad-al-drehem',
    name: 'حمد الدريهم',
    sourcePage: ISLAMHOUSE_HAMAD,
    individualAudio: true,
    recordings: [],
  },
  {
    id: 'sulaiman-al-shuhayhi',
    name: 'سليمان بن محمد الشويهي',
    sourcePage: ISLAMHOUSE_SULAIMAN,
    individualAudio: false,
    recordings: [],
  },
  {
    id: 'walid-abu-ziyad',
    name: 'وليد أبو زياد',
    sourcePage: '',
    individualAudio: false,
    recordings: [],
    legacyOnly: true,
  },
]

export function findAdhkarReciter(id: string): AdhkarReciter | null {
  return ADHKAR_RECITERS.find((reciter) => reciter.id === id) || null
}

export function listAdhkarReciters(
  options: {
    includeLegacy?: boolean
    hasIndividualAudio?: boolean
    includeSourceOnly?: boolean
  } = {},
): AdhkarReciter[] {
  return ADHKAR_RECITERS.filter((reciter) => {
    // Source page or historical name alone is not an audio recording.
    if (reciter.legacyOnly) return false
    if (reciter.recordings.some((entry) => Boolean(makeAdhkarAudioUrl(entry.url)))) return true
    // Only opt into individual-audio readers when the caller has actually
    // verified that this category contains playable per-item recordings.
    return reciter.individualAudio && options.hasIndividualAudio === true
  })
}

export function findAdhkarRecording(
  reciterId: string,
  type: AdhkarDailyType,
  options: { allowCombined?: boolean } = {},
): AdhkarRecording | null {
  const reciter = findAdhkarReciter(reciterId)
  if (!reciter) return null
  const exact = reciter.recordings.find((recording) => recording.type === type)
  if (exact) return exact
  if (options.allowCombined && (type === 'morning' || type === 'evening')) {
    return reciter.recordings.find(
      (recording) => recording.type === 'day-and-night',
    ) || null
  }
  return null
}

export function getAdhkarRecordingKinds(
  reciterId: string,
  type: AdhkarDailyType,
): { individual: boolean; section: boolean; combined: boolean } {
  const reciter = findAdhkarReciter(reciterId)
  if (!reciter) return { individual: false, section: false, combined: false }
  return {
    individual: reciter.individualAudio,
    section: reciter.recordings.some((recording) => recording.type === type),
    combined: (type === 'morning' || type === 'evening') &&
      reciter.recordings.some((recording) => recording.type === 'day-and-night'),
  }
}

function approvedAudioURL(value: string): URL | null {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username || url.password || url.port || url.hash ||
      !ALLOWED_EXTENSIONS.test(url.pathname) ||
      url.pathname.includes('..')
    ) return null
    const host = url.hostname.toLowerCase()
    if (
      host === 'download.tvquran.com' &&
      /^\/download\/TvQuran\.com__Athkar\/TvQuran\.com_athkar_\d{2}\.mp3$/i.test(url.pathname)
    ) return url
    if (
      host === 'cdn.jsdelivr.net' &&
      /^\/gh\/rn0x\/Adhkar-json@main\/audio\/[a-z0-9_-]+\.mp3$/i.test(url.pathname)
    ) return url
    if (
      host === 'raw.githubusercontent.com' &&
      /^\/rn0x\/Adhkar-json\/main\/audio\/[a-z0-9_-]+\.mp3$/i.test(url.pathname)
    ) return url
    if (
      /^d\d+\.islamhouse\.com$/.test(host) &&
      /^\/data\/ar\/ih_sounds\/[a-z0-9_./-]+\.mp3$/i.test(url.pathname)
    ) return url
  } catch { /* unsupported URL */ }
  return null
}

export function makeAdhkarAudioUrl(value: string): string | null {
  const approved = approvedAudioURL(value)
  return approved
    ? `/api/adhkar-audio?url=${encodeURIComponent(approved.href)}`
    : null
}

export function getIndividualAdhkarAudio(
  reciterId: string,
  item: { audio?: string | null },
): string | null {
  const reciter = findAdhkarReciter(reciterId)
  if (!reciter?.individualAudio || !item.audio) return null
  if (/^https:\/\//i.test(item.audio)) return makeAdhkarAudioUrl(item.audio)
  const path = item.audio.replace(/^\/+/, '')
  if (!/^audio\/[a-zA-Z0-9_-]+\.mp3$/.test(path)) return null
  return makeAdhkarAudioUrl(`${ITEM_AUDIO_SOURCE}/${path}`)
}

export async function checkAdhkarRecording(
  recording: AdhkarRecording,
  signal?: AbortSignal,
): Promise<AdhkarAudioCheck> {
  const url = makeAdhkarAudioUrl(recording.url)
  if (!url) return { status: 'unknown', reason: 'unsupported-audio-url' }
  if (typeof fetch === 'undefined') return { status: 'unknown', reason: 'fetch-unavailable' }
  if (signal?.aborted) return { status: 'unknown', reason: 'cancelled' }
  const controller = new AbortController()
  const cancel = () => controller.abort()
  const timer = setTimeout(cancel, 10000)
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-1023' },
      cache: 'no-store',
      signal: controller.signal,
    })
    const mime = (response.headers.get('content-type') || '').toLowerCase()
    const good = (response.status === 200 || response.status === 206) &&
      (mime.startsWith('audio/') || mime.startsWith('application/octet-stream'))
    if (response.body) await response.body.cancel().catch(() => undefined)
    if (good) return { status: 'available', statusCode: response.status }
    if (response.status === 404 || response.status === 410) {
      return { status: 'unavailable', statusCode: response.status }
    }
    return { status: 'unknown', reason: `http-${response.status}` }
  } catch {
    return { status: 'unknown', reason: signal?.aborted ? 'cancelled' : 'network-error' }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
