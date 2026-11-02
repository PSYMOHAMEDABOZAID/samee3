import { NextRequest, NextResponse } from 'next/server'
import { GET as readRiwayat } from '../route'
import { StreamingMushafZip, chunksOf, textChunks } from '@/lib/alafasy-zip-stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// The deployment plan may enforce a lower limit. Whole-mushaf ZIPs can be large.
export const maxDuration = 300

type Edition = {
  id: string
  name: string
  source: string
  sourceUrl: string
  surahIds: number[]
}
type Catalog = { reciter: string; editions: Edition[] }

const SURAHS = 'الفاتحة,البقرة,آل عمران,النساء,المائدة,الأنعام,الأعراف,الأنفال,التوبة,يونس,هود,يوسف,الرعد,إبراهيم,الحجر,النحل,الإسراء,الكهف,مريم,طه,الأنبياء,الحج,المؤمنون,النور,الفرقان,الشعراء,النمل,القصص,العنكبوت,الروم,لقمان,السجدة,الأحزاب,سبأ,فاطر,يس,الصافات,ص,الزمر,غافر,فصلت,الشورى,الزخرف,الدخان,الجاثية,الأحقاف,محمد,الفتح,الحجرات,ق,الذاريات,الطور,النجم,القمر,الرحمن,الواقعة,الحديد,المجادلة,الحشر,الممتحنة,الصف,الجمعة,المنافقون,التغابن,الطلاق,التحريم,الملك,القلم,الحاقة,المعارج,نوح,الجن,المزمل,المدثر,القيامة,الإنسان,المرسلات,النبأ,النازعات,عبس,التكوير,الانفطار,المطففين,الانشقاق,البروج,الطارق,الأعلى,الغاشية,الفجر,البلد,الشمس,الليل,الضحى,الشرح,التين,العلق,القدر,البينة,الزلزلة,العاديات,القارعة,التكاثر,العصر,الهمزة,الفيل,قريش,الماعون,الكوثر,الكافرون,النصر,المسد,الإخلاص,الفلق,الناس'.split(',')
const pad = (n: number) => String(n).padStart(3, '0')
const jsonError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })

function isCatalog(value: unknown): value is Catalog {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<Catalog>
  return Array.isArray(data.editions) && data.editions.every(e =>
    typeof e.id === 'string' && typeof e.name === 'string' &&
    typeof e.source === 'string' && typeof e.sourceUrl === 'string' &&
    Array.isArray(e.surahIds) && e.surahIds.every(n => Number.isInteger(n) && n >= 1 && n <= 114),
  )
}

function cleanName(value: string): string {
  return value.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 110) || 'مصحف الروايات'
}

function responseIsAudio(response: Response): boolean {
  const mime = (response.headers.get('content-type') || '').toLowerCase()
  const declaredSize = Number(response.headers.get('content-length'))
  // Exclude HTML error pages (including responses returned with HTTP 200).
  return response.status === 200 && Boolean(response.body) &&
    (mime.startsWith('audio/') || mime.startsWith('application/octet-stream')) &&
    !(Number.isFinite(declaredSize) && declaredSize > 0xffffffff)
}

async function getCatalog(origin: string): Promise<Catalog | null> {
  // Reuse the existing API's publisher-validated catalog instead of trusting
  // a URL or a made-up list from the user's query string.
  const response = await readRiwayat(new NextRequest(`${origin}/api/alafasy-riwayat`))
  if (!response.ok) return null
  const result: unknown = await response.json()
  return isCatalog(result) ? result : null
}

async function getAudio(origin: string, editionId: string, surah: number): Promise<Response> {
  const params = new URLSearchParams({ stream: editionId, surah: String(surah) })
  return readRiwayat(new NextRequest(`${origin}/api/alafasy-riwayat?${params.toString()}`))
}

/** GET /api/alafasy-riwayat/zip?edition=way-... */
export async function GET(request: NextRequest): Promise<Response> {
  const editionId = request.nextUrl.searchParams.get('edition') || ''
  if (!/^(?:way-[a-z0-9-]+|mp3-\d{1,12})$/.test(editionId)) {
    return jsonError('اختر مصحفًا صحيحًا لتنزيله.', 400)
  }

  const origin = request.nextUrl.origin
  const catalog = await getCatalog(origin).catch(() => null)
  if (!catalog) return jsonError('تعذر قراءة فهرس روايات العفاسي.', 503)
  const edition = catalog.editions.find(entry => entry.id === editionId)
  if (!edition) return jsonError('المصحف غير موجود حاليًا لدى المصادر.', 404)
  const surahIds = [...new Set(edition.surahIds)].filter(n => n >= 1 && n <= 114).sort((a, b) => a - b)
  if (!surahIds.length) return jsonError('هذا المصحف ليس له تسجيلات منشورة.', 404)

  // Confirm that at least one actual MP3 is accessible before sending ZIP headers.
  const skipped: number[] = []
  let first: { index: number; surah: number; response: Response } | null = null
  for (let index = 0; index < surahIds.length; index += 1) {
    const surah = surahIds[index]
    try {
      const response = await getAudio(origin, editionId, surah)
      if (responseIsAudio(response)) {
        first = { index, surah, response }
        break
      }
      await response.body?.cancel().catch(() => undefined)
    } catch { /* unavailable source: try the next published surah */ }
    skipped.push(surah)
  }
  if (!first) return jsonError('لا توجد تسجيلات صوتية قابلة للتنزيل حاليًا لهذا المصحف.', 502)

  const found = first
  const filename = `${cleanName(`مشاري العفاسي - ${edition.name}`)}.zip`
  const asciiFilename = `Alafasy-${editionId.replace(/[^a-zA-Z0-9-]/g, '')}.zip`
  const cancelled = { value: false }

  async function* zipData(): AsyncGenerator<Uint8Array> {
    const zip = new StreamingMushafZip()
    const included: number[] = []
    for (let index = found.index; index < surahIds.length; index += 1) {
      if (cancelled.value) return
      const surah = surahIds[index]
      let response: Response
      try {
        response = index === found.index
          ? found.response
          : await getAudio(origin, editionId, surah)
      } catch {
        skipped.push(surah)
        continue
      }
      if (!responseIsAudio(response) || !response.body) {
        await response.body?.cancel().catch(() => undefined)
        skipped.push(surah)
        continue
      }
      // The stream must complete before the data descriptor and central index
      // are emitted. If a connection breaks in the middle, the download fails
      // rather than producing a misleading “complete” ZIP archive.
      const entryName = `${pad(surah)} - ${SURAHS[surah - 1]}.mp3`
      for await (const chunk of zip.add(entryName, chunksOf(response.body))) {
        if (cancelled.value) return
        yield chunk
      }
      included.push(surah)
    }

    const summary = [
      `اسم المصحف: ${edition.name}`,
      'القارئ: مشاري راشد العفاسي',
      `المصدر: ${edition.source}`,
      `صفحة المصدر: ${edition.sourceUrl}`,
      `السور المدرجة لدى المصدر: ${surahIds.length}`,
      `ملفات MP3 التي تم تضمينها: ${included.length}`,
      `السور التي تعذّر تنزيلها: ${skipped.length ? skipped.map(pad).join('، ') : 'لا يوجد'}`,
      '',
      'ملاحظة: إذا لم تكن الرواية منشورة كاملة، فإن ZIP يحتوي على السور',
      'المتاحة فعليًا فقط. لا تُستبدل تسجيلات هذه الرواية بتسجيلات رواية أخرى.',
    ].join('\n')
    yield* zip.add('معلومات المصحف.txt', textChunks(summary))
    yield* zip.finish()
  }

  const iterator = zipData()
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next()
        if (next.done) controller.close()
        else controller.enqueue(next.value)
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel() {
      cancelled.value = true
      try { await iterator.return(undefined) } catch { /* connection already closed */ }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
