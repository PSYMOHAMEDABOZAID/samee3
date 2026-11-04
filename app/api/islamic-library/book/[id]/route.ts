import { courseById } from '@/lib/islamic/curriculum'
import { mergeLibraryBook, mergeLessons, type StoredRecord } from '@/lib/islamic/managed-library'
import { NextRequest, NextResponse } from 'next/server'
import { SUNNI_LIBRARY_BOOKS, type SunniLibraryBook } from '@/lib/islamic/sunniLibrary'
import { db } from '@/lib/firebase'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QURANPEDIA_BASE = 'https://api.quranpedia.net/v1'

interface LearningVideo {
  id: string
  title: string
  url: string
  order: number
}

interface DynamicBookFields {
  id?: string
  title?: string
  author?: string
  category?: string
  level?: string
  description?: string
  readingUrl?: string | null
  readingLabel?: string | null
  sharhTitle?: string | null
  sharhAuthor?: string | null
  sharhUrl?: string | null
  sharhLabel?: string | null
  downloadUrl?: string | null
  quranpediaBookId?: number | null
  videos?: unknown
  deleted?: boolean
  publication?: {
    publishYear?: string | number | null
    edition?: string | null
    publisher?: string | null
    parts?: number | null
  } | null
}

function getQuranpediaId(book: SunniLibraryBook & DynamicBookFields): number | null {
  if (Number.isSafeInteger(book.quranpediaBookId) && Number(book.quranpediaBookId) > 0) {
    return Number(book.quranpediaBookId)
  }

  const candidates = [book.readingUrl || '', book.sharhUrl || '']

  for (const url of candidates) {
    const match = url.match(/quranpedia\.net\/book\/(\d+)/i)

    if (match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) > 0) {
      return Number(match[1])
    }
  }

  return null
}

function cleanText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectText(
  value: unknown,
  output: Array<{
    text: string
    page?: number
    part?: number
    section?: string
  }>,
  context: {
    page?: number
    part?: number
    section?: string
  } = {},
  depth = 0,
) {
  if (!value || depth > 20 || output.length >= 12000) {
    return
  }

  if (typeof value === 'string') {
    const text = cleanText(value)

    if (text) {
      output.push({
        text,
        ...context,
      })
    }

    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectText(item, output, context, depth + 1)
    }

    return
  }

  if (typeof value !== 'object') {
    return
  }

  const obj = value as Record<string, unknown>

  const numericPage = Number(obj.page)
  const numericPart = Number(obj.part)

  const nextContext = {
    page: Number.isFinite(numericPage) && numericPage > 0 ? numericPage : context.page,

    part: Number.isFinite(numericPart) && numericPart > 0 ? numericPart : context.part,

    section:
      typeof obj.title === 'string'
        ? cleanText(obj.title)
        : typeof obj.section === 'string'
          ? cleanText(obj.section)
          : context.section,
  }

  const directKeys = ['text', 'content', 'body', 'description']

  for (const key of directKeys) {
    if (typeof obj[key] === 'string') {
      collectText(obj[key], output, nextContext, depth + 1)
    }
  }

  for (const [key, child] of Object.entries(obj)) {
    if (directKeys.includes(key)) {
      continue
    }

    if (
      key === 'book' ||
      key === 'author' ||
      key === 'metadata' ||
      key === 'language' ||
      key === 'category' ||
      key === 'contents_url' ||
      key === 'contentsUrl'
    ) {
      continue
    }

    if (typeof child === 'object' && child !== null) {
      collectText(child, output, nextContext, depth + 1)
    }
  }
}

/** Only the documented Quranpedia API may supply remote book metadata or text. */
function safeQuranpediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === 'api.quranpedia.net' &&
      (parsed.port === '' || parsed.port === '443') &&
      !parsed.username &&
      !parsed.password
    )
  } catch {
    return false
  }
}

async function fetchJson(url: string, signal: AbortSignal): Promise<any> {
  if (!safeQuranpediaUrl(url)) throw new Error('UNTRUSTED_CONTENT_URL')
  const response = await fetch(url, {
    cache: 'no-store',
    signal,
    redirect: 'error',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const declaredSize = Number(response.headers.get('content-length') || 0)
  const limit = 15 * 1024 * 1024
  if (declaredSize > limit) throw new Error('BOOK_TOO_LARGE')
  const raw = await response.text()
  if (raw.length > limit) throw new Error('BOOK_TOO_LARGE')
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error('INVALID_BOOK_JSON')
  }
}

function normalizeVideo(value: unknown, fallbackId: string, fallbackOrder: number): LearningVideo | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as Record<string, unknown>

  const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : fallbackId

  const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'درس بدون عنوان'

  const url =
    typeof item.url === 'string' && item.url.trim()
      ? item.url.trim()
      : typeof item.videoUrl === 'string' && item.videoUrl.trim()
        ? item.videoUrl.trim()
        : ''

  const numericOrder = Number(item.order)

  const order = Number.isFinite(numericOrder) && numericOrder >= 0 ? numericOrder : fallbackOrder

  if (!url) {
    return null
  }

  return {
    id,
    title,
    url,
    order,
  }
}

function normalizeVideos(value: unknown): LearningVideo[] {
  if (!Array.isArray(value)) {
    return []
  }

  const result: LearningVideo[] = []

  value.forEach((item, index) => {
    const video = normalizeVideo(item, `video-${index + 1}`, index)

    if (video) {
      result.push(video)
    }
  })

  return result.sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order
    }

    return a.title.localeCompare(b.title, 'ar')
  })
}

async function loadFirestoreBook(bookId: string): Promise<{
  exists: boolean
  book: DynamicBookFields | null
  videos: LearningVideo[]
}> {
  const results = await Promise.allSettled([
    getDoc(doc(db, 'islamicLibraryBooks', bookId)),
    getDocs(collection(db, 'islamicLibraryBooks', bookId, 'videos')),
  ])
  const snapshot = results[0].status === 'fulfilled' ? results[0].value : null
  const lessons: StoredRecord[] =
    results[1].status === 'fulfilled'
      ? results[1].value.docs.map((item) => ({ id: item.id, data: item.data() }))
      : []
  const raw = snapshot?.data() || {},
    book = mergeLibraryBook(bookId, raw)
  return {
    exists: snapshot?.exists() || false,
    book: snapshot?.exists() ? (raw as DynamicBookFields) : null,
    videos: mergeLessons(book?.videos, lessons).filter((lesson) => !lesson.deleted),
  }
}

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>
  },
) {
  let fallbackBook: unknown = null
  const controller = new AbortController()

  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const rawId = (await context.params).id || ''

    let bookId: string
    try {
      bookId = decodeURIComponent(rawId)
    } catch {
      return NextResponse.json({ success: false, error: 'INVALID_BOOK_ID' }, { status: 400 })
    }
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(bookId)) {
      return NextResponse.json({ success: false, error: 'INVALID_BOOK_ID' }, { status: 400 })
    }

    const staticBook = courseById(bookId) || SUNNI_LIBRARY_BOOKS.find((item) => item.id === bookId)

    const firestoreResult = await Promise.race([
      loadFirestoreBook(bookId),
      new Promise<{ exists: boolean; book: DynamicBookFields | null; videos: LearningVideo[] }>((resolve) =>
        setTimeout(() => resolve({ exists: false, book: null, videos: [] }), 2500),
      ),
    ])

    if ((!staticBook && !firestoreResult.exists) || firestoreResult.book?.deleted === true) {
      return NextResponse.json(
        {
          success: false,
          error: 'BOOK_NOT_FOUND',
        },
        {
          status: 404,
        },
      )
    }

    const managedBook = mergeLibraryBook(bookId, firestoreResult.book || {}, staticBook)
    if (!managedBook) return NextResponse.json({ success: false, error: 'BOOK_NOT_FOUND' }, { status: 404 })
    const mergedBook = { ...managedBook, publication: firestoreResult.book?.publication || null }
    fallbackBook = mergedBook
    const videos = firestoreResult.videos

    const quranpediaId = getQuranpediaId(mergedBook as SunniLibraryBook & DynamicBookFields)

    if (!quranpediaId) {
      return NextResponse.json({
        success: true,
        source: 'external',

        book: mergedBook,

        videos,

        contents: [],

        message:
          'هذا الكتاب لا يملك حاليًا مصدرًا نصيًا موحدًا داخل API التطبيق، لكن يمكنك القراءة أو التحميل ومشاهدة الدروس من داخل المنصة.',
      })
    }

    const meta = await fetchJson(`${QURANPEDIA_BASE}/book/${quranpediaId}`, controller.signal)

    let rawContents: unknown = null

    const contentsUrl =
      typeof meta?.contents_url === 'string'
        ? meta.contents_url
        : typeof meta?.contentsUrl === 'string'
          ? meta.contentsUrl
          : ''

    if (contentsUrl) {
      try {
        rawContents = await fetchJson(contentsUrl, controller.signal)
      } catch {
        rawContents = null
      }
    }

    const sections: Array<{
      text: string
      page?: number
      part?: number
      section?: string
    }> = []

    // A metadata blurb is not the book's actual text. Never label it as a complete edition.
    if (rawContents) collectText(rawContents, sections)

    const deduped = sections.filter((item, index) => {
      if (!item.text) {
        return false
      }

      const previous = sections[index - 1]

      return (
        !previous || previous.text !== item.text || previous.page !== item.page || previous.part !== item.part
      )
    })

    return NextResponse.json({
      success: true,
      source: 'quranpedia',

      quranpediaBookId: quranpediaId,

      book: {
        ...mergedBook,

        publication: {
          publishYear: meta?.publish_year ?? meta?.publishYear ?? mergedBook.publication?.publishYear ?? null,

          edition: meta?.edition ?? mergedBook.publication?.edition ?? null,

          publisher: meta?.nasher ?? meta?.publisher ?? mergedBook.publication?.publisher ?? null,

          parts: meta?.parts ?? mergedBook.publication?.parts ?? null,
        },
      },

      videos,

      contents: deduped,
      message:
        deduped.length === 0
          ? 'لم يتوفر نص الكتاب كاملًا لدى المصدر حاليًا. استخدم رابط القراءة الخارجي المتاح.'
          : null,
    })
  } catch (error) {
    if (fallbackBook) return NextResponse.json({ success: true, source: 'external', book: fallbackBook, contents: [], message: 'تعذر الاتصال بمصدر النص حاليًا. يمكنك قراءة نسخة PDF أو فتح مصدر الكتاب والشرح.' })
    const isTimeout = error instanceof DOMException && error.name === 'AbortError'

    return NextResponse.json(
      {
        success: false,
        error: isTimeout ? 'TIMEOUT' : 'LOAD_FAILED',
      },
      {
        status: 500,
      },
    )
  } finally {
    clearTimeout(timer)
  }
}
