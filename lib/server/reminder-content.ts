/**
 * SAMEE3: authoritative, varied web notifications.
 * Sources are the same published catalogues used by the reading sections.
 * Never generates religious text. Safe fallbacks are existing SAMEE3 excerpts.
 */
import adhkarData from '@/public/data/adhkar.json'
import emergencyHadiths from '@/native/shared/reminders.json'
import { HADITH_BOOKS, parseHadithChapters, parseChapterHadiths } from '@/lib/hadith-catalog'
import { locationDate } from '@/lib/prayer-times'
import type { ReminderEvent, WebReminderSettings } from '@/lib/web-reminders'
import { serverDb } from './firebase-admin'

type Snippet = { title: string; body: string; url: string }
type DayContents = { version: number; quran: Snippet[]; hadith: Snippet[] }
const VERSION = 3
const dayPromises = new Map<string, Promise<DayContents>>()
const mod = (x: number, n: number) => ((x % n) + n) % n
const daySerial = (date: string) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000)
const excerpt = (s: string, limit = 260) => {
  const normalized = s.replace(/\s+/g, ' ').trim()
  return normalized.length > limit ? `${normalized.slice(0, limit).trimEnd()}…` : normalized
}
const validSnippet = (item: unknown): item is Snippet => {
  if (!item || typeof item !== 'object') return false
  const value = item as Record<string, unknown>
  return typeof value.title === 'string' && typeof value.body === 'string' && typeof value.url === 'string' &&
    value.title.length > 0 && value.title.length <= 150 && value.body.length <= 1000 &&
    value.url.startsWith('/') && !value.url.startsWith('//') && value.url.length <= 300
}

// Only published Adhkar from SAMEE3's own canonical local library.
const adhkarPool: Array<Snippet & { categoryId: number; name: string }> = adhkarData.flatMap(category =>
  category.array.flatMap(item => {
    if (!Number.isSafeInteger(category.id) || !Number.isSafeInteger(item.id) ||
        item.id < 1 || category.id < 1 || typeof item.text !== 'string' || item.text.trim().length < 25) return []
    return [{
      categoryId: category.id,
      name: category.category,
      title: `ذكر من ${category.category}`,
      body: excerpt(item.text),
      url: `/notifications/adhkar?categoryId=${category.id}&itemId=${item.id}`,
    }]
  }),
)

function chooseDhikr(date: string, slot: number, daily = false): Snippet | null {
  const list = daily
    ? adhkarPool.filter(item => item.name.includes('الصباح') && item.name.includes('المساء'))
    : adhkarPool
  if (!list.length) return null
  // 37 is coprime to the current published corpus; a full cycle is traversed
  // before repeating. The exact source URL is retained for the notification tap.
  const pick = list[mod(daySerial(date) * 37 + slot * 29, list.length)]
  return { title: pick.title, body: pick.body, url: pick.url }
}

const fallbackHadith: Snippet[] = emergencyHadiths.hadiths
  .filter(item => item.text && item.id && item.text.length < 800)
  .map(item => ({ title: `حديث نبوي • ${item.reference}`, body: excerpt(item.text),
    url: `/notifications/hadith?id=${encodeURIComponent(item.id)}` }))

// Official API of the very same book/chapter reader used inside SAMEE3.
const HADITH_API = 'https://alfurqan.online/api/v1/hadith'
async function jsonFromTrustedApi(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(6500),
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok || /text\/html/i.test(response.headers.get('content-type') || '')) throw Error('Source unavailable')
  if (Number(response.headers.get('content-length') || 0) > 2_000_000) throw Error('Large source')
  const text = await response.text()
  if (text.length > 2_000_000) throw Error('Large source')
  return JSON.parse(text) as unknown
}

async function loadHadiths(date: string): Promise<Snippet[]> {
  const day = daySerial(date)
  // Rotate through all books that the SAMEE3 Hadith catalogue exposes.
  const candidates = HADITH_BOOKS.filter(book => book.id !== 'shahwaliullah40')
  const book = candidates[mod(day * 7, candidates.length)]
  try {
    const bookData = await jsonFromTrustedApi(`${HADITH_API}/${encodeURIComponent(book.id)}`)
    const chapters = parseHadithChapters(bookData).filter(chapter => Number.isSafeInteger(chapter.id) && chapter.id >= 0)
    if (!chapters.length) throw Error('No chapters')
    const chapter = chapters[mod(day * 13, chapters.length)]
    const chapterData = await jsonFromTrustedApi(`${HADITH_API}/${encodeURIComponent(book.id)}/chapter/${chapter.id}`)
    const entries = parseChapterHadiths(chapterData)
      .filter(hadith => hadith.chapterId === chapter.id && hadith.idInBook > 0 && hadith.arabic.trim().length >= 40)
    if (!entries.length) throw Error('No verified entries')
    return entries.slice(0, 30).map(hadith => ({
      title: `حديث من ${book.name_ar}`,
      body: `${excerpt(hadith.arabic)}\n${book.name_ar} • رقم ${hadith.idInBook}`,
      url: `/hadith?book=${encodeURIComponent(book.id)}&chapter=${chapter.id}&hadith=${hadith.idInBook}`,
    }))
  } catch {
    return fallbackHadith
  }
}

// The precise-verse destination in SAMEE3 already uses this Quran API.
// It supplies the authentic text plus the Hafs page for direct navigation.
async function loadQuran(date: string): Promise<Snippet[]> {
  const day = daySerial(date)
  const chosen = [0, 1, 2].map(slot => mod(day * 613 + slot * 151, 6236) + 1)
  const result = await Promise.all(chosen.map(async number => {
    try {
      const data = await jsonFromTrustedApi(`https://api.alquran.cloud/v1/ayah/${number}`)
      const record = data && typeof data === 'object' && 'data' in data ? data.data : null
      if (!record || typeof record !== 'object') throw Error('Invalid ayah')
      const ayah = record as { text?: unknown; page?: unknown; numberInSurah?: unknown; surah?: { number?: unknown; name?: unknown } }
      const surah = Number(ayah.surah?.number), verse = Number(ayah.numberInSurah), page = Number(ayah.page)
      if (!Number.isSafeInteger(surah) || surah < 1 || surah > 114 ||
          !Number.isSafeInteger(verse) || verse < 1 || verse > 286 ||
          !Number.isSafeInteger(page) || page < 1 || page > 604 ||
          typeof ayah.text !== 'string' || !ayah.text.trim()) throw Error('Invalid ayah')
      return {
        title: `آية من ${typeof ayah.surah?.name === 'string' ? ayah.surah.name : `سورة ${surah}`}`,
        body: excerpt(ayah.text),
        url: `/mushaf?page=${page}&ayah=${surah}%3A${verse}&riwaya=hafs`,
      } satisfies Snippet
    } catch { return null }
  }))
  return result.filter((item): item is Snippet => item !== null)
}

async function dayContents(date: string, needHadith: boolean, needQuran: boolean): Promise<DayContents> {
  const key = `${date}-${needHadith ? 'h' : ''}${needQuran ? 'q' : ''}`
  const existing = dayPromises.get(key)
  if (existing) return existing
  const pending = (async () => {
    const reference = serverDb().doc(`notificationContentCache/v${VERSION}-${key}`)
    try {
      const saved = (await reference.get()).data() as DayContents | undefined
      if (saved?.version === VERSION && Array.isArray(saved.hadith) &&
          Array.isArray(saved.quran) && saved.hadith.every(validSnippet) && saved.quran.every(validSnippet)) return saved
    } catch { /* An unavailable cache must not block notifications. */ }
    const [hadith, quran] = await Promise.all([
      needHadith ? loadHadiths(date) : Promise.resolve([] as Snippet[]),
      needQuran ? loadQuran(date) : Promise.resolve([] as Snippet[]),
    ])
    const result = { version: VERSION, hadith, quran }
    try { await reference.set({ ...result, expiresAt: new Date(Date.now() + 7 * 86400000) }) } catch { /* Read-only fallback */ }
    return result
  })()
  dayPromises.set(key, pending)
  // A warm Vercel worker does not need an unbounded in-memory history.
  if (dayPromises.size > 10) dayPromises.delete(dayPromises.keys().next().value!)
  return pending
}

function select(list: Snippet[], date: string, slot: number): Snippet | null {
  return list.length ? list[mod(daySerial(date) * 7 + slot * 5, list.length)] : null
}

/**
 * Enrich events AFTER reminderEvents has respected each user's categories and
 * times. No extra notifications are added: existing hadith-hour slots become
 * a rotating selection from enabled SAMEE3 sections.
 */
export async function diversifyReminderEvents(
  events: ReminderEvent[],
  settings: WebReminderSettings,
): Promise<ReminderEvent[]> {
  if (!events.some(event => ['hadith', 'quran', 'morning', 'evening'].includes(event.kind))) return events
  const dates = [...new Set(events.map(event => locationDate(new Date(event.at), settings.timezone)))]
  const daily = new Map<string, DayContents>()
  // Avoid external fetches when neither Quran nor Hadith content is requested.
  if (settings.quran || settings.hadith) {
    await Promise.all(dates.map(async date => {
      try { daily.set(date, await dayContents(date, settings.hadith, settings.quran)) } catch { /* Keep original content */ }
    }))
  }
  const slotByDate = new Map<string, number>()
  return events.map(event => {
    const date = locationDate(new Date(event.at), settings.timezone)
    const content = daily.get(date)
    const day = daySerial(date)
    if (event.kind === 'quran') return content?.quran.length
      ? { ...event, ...select(content.quran, date, 0)! } : event
    if (event.kind === 'morning' || event.kind === 'evening') {
      const dhikr = chooseDhikr(date, event.kind === 'morning' ? 0 : 71, true)
      return dhikr ? { ...event, title: event.title, body: dhikr.body, url: dhikr.url } : event
    }
    if (event.kind !== 'hadith') return event
    const slot = slotByDate.get(date) || 0
    slotByDate.set(date, slot + 1)
    // Give enabled Quran, Hadith and Adhkar a fair slot every day when
    // the selected reminder frequency allows it. Other sections rotate in
    // the remaining slots. With fewer slots, rotate the priority by day.
    const core = [
      'hadith',
      ...(settings.quran ? ['quran'] : []),
      ...(settings.adhkar ? ['adhkar'] : []),
    ]
    const discovery = [
      ...(settings.quran ? ['visual'] : []),
      ...(settings.audio ? ['audio'] : []),
      ...(settings.library ? ['library'] : []),
    ]
    const section = slot < core.length || !discovery.length
      ? core[mod(day + slot, core.length)]
      : discovery[mod(day + slot - core.length, discovery.length)]
    const article = section === 'hadith' ? select(content?.hadith || fallbackHadith, date, slot)
      : section === 'quran' ? select(content?.quran || [], date, slot + 1)
      : section === 'adhkar' ? chooseDhikr(date, slot + 19)
      : section === 'visual' ? { title: 'آيات مرئية من سميع', body: 'استمتع بالآيات المرئية في قسم المصحف المرئي.', url: '/visual-ayahs' }
      : section === 'audio' ? { title: 'من المكتبة الصوتية', body: 'اكتشف قارئًا وتلاوة من مكتبة سميع الصوتية.', url: '/audio' }
      : section === 'library' ? { title: 'من المكتبة الشرعية', body: 'اختر كتابًا أو درسًا جديدًا في مكتبة سميع الشرعية.', url: '/islamic-library' }
      : null
    // If the selected external source failed, preserve the reliable fallback.
    return article ? { ...event, title: article.title, body: article.body, url: article.url } : event
  })
}