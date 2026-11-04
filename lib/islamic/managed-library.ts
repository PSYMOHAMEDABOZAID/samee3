import { LEARNING_COURSES, LEARNING_LEVELS, type LearningCourse, type LevelId } from './curriculum'
import { SUNNI_LIBRARY_BOOKS, SUNNI_LIBRARY_CATEGORIES, type SunniLibraryBook } from './sunniLibrary'
import { safeIslamicLibraryLink } from './safeLinks'
import { youtubeSource } from './youtube-player'

export type LessonPolicy = {
  allowSeeking?: boolean | null
  allowSpeed?: boolean | null
  policyRevision?: string
}
export type ManagedLesson = LessonPolicy & {
  id: string
  title: string
  author?: string
  url: string
  order: number
  deleted?: boolean
}
export type PlaylistOverride = LessonPolicy & {
  title?: string
  author?: string
  url?: string
  deleted?: boolean
}
export type ManagedBook = Omit<LearningCourse, 'videos'> & {
  custom: boolean
  deleted: boolean
  videos: ManagedLesson[]
  lessonSeekDefault: boolean
  lessonSpeedDefault: boolean
  lessonPolicyRevision: string
  playlistPolicies: Record<string, PlaylistOverride>
  featuredAt: number
}
export type StoredRecord = { id: string; data: Record<string, unknown> }
export const LIBRARY_CATALOG = Array.from(
  new Map<string, SunniLibraryBook>(
    [...SUNNI_LIBRARY_BOOKS, ...LEARNING_COURSES].map((book) => [book.id, book]),
  ).values(),
)
export const BOOK_TEXT_FIELDS = [
  'title',
  'author',
  'description',
  'readingLabel',
  'sharhTitle',
  'sharhAuthor',
  'sharhLabel',
  'videoAuthor',
  'resourceNote',
] as const
export const BOOK_LINK_FIELDS = [
  'readingUrl',
  'downloadUrl',
  'sharhUrl',
  'videoUrl',
  'audioUrl',
  'audioSourceUrl',
  'videoDownloadUrl',
] as const
export const libraryLevelId = (level: string): LevelId =>
  level === 'متوسط' ? 'intermediate' : level === 'متقدم' ? 'advanced' : 'beginner'
export const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
export const string = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)
export const validBookId = (id: string) => /^[a-zA-Z0-9_-]{1,120}$/.test(id)
export const directVideo = (value: unknown) => {
  const safe = safeIslamicLibraryLink(value)
  return safe && /\.(mp4|webm|m4v|ogv)(?:$|[?#])/i.test(safe) ? safe : null
}
export const validVideo = (value: unknown) => !!(youtubeSource(value) || directVideo(value))
function policy(raw: Record<string, unknown>): LessonPolicy {
  return {
    allowSeeking: typeof raw.allowSeeking === 'boolean' ? raw.allowSeeking : null,
    allowSpeed: typeof raw.allowSpeed === 'boolean' ? raw.allowSpeed : null,
    policyRevision: string(raw.policyRevision),
  }
}
export function normalizeLesson(value: unknown, fallbackId: string, index = 0): ManagedLesson | null {
  const raw = record(value),
    id = string(raw.id, fallbackId)
  if (!validBookId(id) || (!safeIslamicLibraryLink(raw.url) && raw.deleted !== true)) return null
  return {
    id,
    title: string(raw.title, `الدرس ${index + 1}`),
    author: string(raw.author),
    url: safeIslamicLibraryLink(raw.url) || '',
    order: Number.isFinite(Number(raw.order)) && Number(raw.order) > 0 ? Number(raw.order) : index + 1,
    deleted: raw.deleted === true,
    ...policy(raw),
  }
}
export function mergeLessons(base: unknown, overrides: StoredRecord[] = []): ManagedLesson[] {
  const items = new Map<string, ManagedLesson>()
  if (Array.isArray(base))
    base.forEach((value, i) => {
      const lesson = normalizeLesson(value, `stored-${i}`, i)
      if (lesson) items.set(lesson.id, lesson)
    })
  overrides.forEach(({ id, data }, i) => {
    const previous = items.get(id)
    const lesson = normalizeLesson({ ...previous, ...data, id }, id, i)
    if (lesson) items.set(id, lesson)
  })
  return [...items.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}
export function mergeLibraryBook(
  id: string,
  value: unknown = {},
  source = LIBRARY_CATALOG.find((book) => book.id === id),
): ManagedBook | null {
  const raw = record(value)
  if (!validBookId(id) || (!source && !string(raw.title).trim())) return null
  const base = (source || {}) as Partial<LearningCourse>
  const book = {
    ...base,
    id,
    custom: !source,
    deleted: raw.deleted === true,
    title: string(raw.title, base.title),
    author: string(raw.author, base.author),
    description: string(raw.description, base.description),
    category: SUNNI_LIBRARY_CATEGORIES.some((x) => x.id === raw.category)
      ? raw.category
      : base.category || 'aqidah',
    level: LEARNING_LEVELS.some((x) => x.label === raw.level) ? raw.level : base.level || 'مبتدئ',
    lessonSeekDefault: raw.lessonSeekDefault !== false,
    lessonSpeedDefault: raw.lessonSpeedDefault !== false,
    lessonPolicyRevision: string(raw.lessonPolicyRevision),
    playlistPolicies: {},
    featuredAt: typeof raw.featuredAt === 'number' && Number.isFinite(raw.featuredAt) ? raw.featuredAt : 0,
  } as ManagedBook
  book.levelId = libraryLevelId(book.level)
  for (const key of BOOK_TEXT_FIELDS) book[key] = string(raw[key], string(base[key]))
  // An explicitly empty link clears the bundled link instead of resurrecting it.
  for (const key of BOOK_LINK_FIELDS)
    book[key] =
      typeof raw[key] === 'string'
        ? safeIslamicLibraryLink(raw[key]) || ''
        : safeIslamicLibraryLink(base[key]) || ''
  if ('quranpediaBookId' in raw)
    book.quranpediaBookId =
      Number.isSafeInteger(raw.quranpediaBookId) && Number(raw.quranpediaBookId) > 0
        ? Number(raw.quranpediaBookId)
        : undefined
  if (Array.isArray(raw.pdfParts))
    book.pdfParts = raw.pdfParts.flatMap((value, i) => {
      const part = record(value),
        url = safeIslamicLibraryLink(part.url)
      return url ? [{ label: string(part.label, `الجزء ${i + 1}`), url }] : []
    })
  else if (typeof raw.downloadUrl === 'string')
    book.pdfParts = book.downloadUrl ? [{ label: 'نسخة الكتاب', url: book.downloadUrl }] : []
  book.videos = mergeLessons(Array.isArray(raw.videos) ? raw.videos : base.videos)
  for (const [key, value] of Object.entries(record(raw.playlistPolicies))) {
    const item = record(value)
    book.playlistPolicies[key] = {
      ...policy(item),
      ...(typeof item.title === 'string' ? { title: item.title } : {}),
      ...(typeof item.author === 'string' ? { author: item.author } : {}),
      ...(typeof item.url === 'string' ? { url: safeIslamicLibraryLink(item.url) || '' } : {}),
      deleted: item.deleted === true,
    }
  }
  return book
}
export function mergeLibraryCatalog(stored: StoredRecord[]): ManagedBook[] {
  const map = new Map(LIBRARY_CATALOG.map((book) => [book.id, mergeLibraryBook(book.id, {}, book)!]))
  stored.forEach(({ id, data }) => {
    const book = mergeLibraryBook(id, data)
    if (book) map.set(id, book)
  })
  return [...map.values()]
}
/** One public book per level/category. Keep the full catalogue available to administrators and old links. */
export function publicLibraryBooks(books: ManagedBook[]): ManagedBook[] {
  const groups = new Map<string, ManagedBook>()
  const priority = (book: ManagedBook) => (LEARNING_COURSES.some(course => course.id === book.id) ? 10 : 0) + (studySources(book).some(source => !source.external) ? 2 : 0) + (book.downloadUrl ? 1 : 0)
  for (const book of books.filter(book => !book.deleted)) {
    const key = `${book.levelId}:${book.category}`, previous = groups.get(key)
    if (!previous || book.featuredAt > previous.featuredAt || (book.featuredAt === previous.featuredAt && priority(book) > priority(previous))) groups.set(key, book)
  }
  return [...groups.values()]
}
export function effectivePolicy(
  book: Pick<ManagedBook, 'lessonSeekDefault' | 'lessonSpeedDefault' | 'lessonPolicyRevision'>,
  lesson?: LessonPolicy,
) {
  const current = !book.lessonPolicyRevision || lesson?.policyRevision === book.lessonPolicyRevision
  return {
    allowSeeking: (current ? lesson?.allowSeeking : null) ?? book.lessonSeekDefault,
    allowSpeed: (current ? lesson?.allowSpeed : null) ?? book.lessonSpeedDefault,
  }
}
export const playlistPolicyKey = (list: string, position: number) => `${list}:${position}`
export function playlistOverride(
  book: ManagedBook,
  list: string,
  position: number,
): PlaylistOverride | undefined {
  return (
    book.playlistPolicies[playlistPolicyKey(list, position)] ||
    (youtubeSource(book.videoUrl)?.list === list ? book.playlistPolicies[String(position)] : undefined)
  )
}
export type StudySource = {
  key: string
  title: string
  url: string
  list?: string
  external?: boolean
  lessons: ManagedLesson[]
}
export function studySources(book: ManagedBook): StudySource[] {
  const sources: StudySource[] = [],
    individual: ManagedLesson[] = []
  const main: ManagedLesson[] = book.videoUrl
    ? [
        {
          id: 'primary-video',
          title: book.videoAuthor ? `شرح ${book.videoAuthor}` : 'الشرح الرئيسي',
          url: book.videoUrl,
          order: 0,
        },
      ]
    : []
  for (const lesson of [...main, ...book.videos.filter((item) => !item.deleted)]) {
    const yt = youtubeSource(lesson.url)
    if (yt?.list) {
      if (!sources.some((item) => item.list === yt.list))
        sources.push({
          key: `playlist-${yt.list}`,
          title: lesson.title,
          url: lesson.url,
          list: yt.list,
          lessons: [lesson],
        })
    } else if (yt?.video) individual.push(lesson)
    else if (directVideo(lesson.url))
      sources.push({ key: `file-${lesson.id}`, title: lesson.title, url: lesson.url, lessons: [lesson] })
    else if (safeIslamicLibraryLink(lesson.url))
      sources.push({
        key: `external-${lesson.id}`,
        title: lesson.title,
        url: lesson.url,
        external: true,
        lessons: [lesson],
      })
  }
  if (individual.length)
    sources.push({
      key: 'individual',
      title: individual.length === 1 ? individual[0].title : 'الدروس المرتبة',
      url: individual[0].url,
      lessons: individual,
    })
  return sources
}
export function playlistLessons(book: ManagedBook, list: string, ids: string[]): ManagedLesson[] {
  return ids
    .map((id, index) => {
      const override = playlistOverride(book, list, index + 1)
      return {
        ...override,
        id: `playlist-${index + 1}-${id}`,
        title: override?.title || `الدرس ${index + 1}`,
        url: override?.url || `https://www.youtube.com/watch?v=${id}`,
        order: index + 1,
      }
    })
    .filter((lesson) => !lesson.deleted)
}
