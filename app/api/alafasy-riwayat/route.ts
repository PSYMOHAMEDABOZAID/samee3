
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Edition = {
  id: string
  name: string
  source: string
  sourceUrl: string
  surahIds: number[]
  server?: string
}

type RawMoshaf = {
  id?: number
  name?: string
  server?: string
  surah_list?: string
}

type RawReciter = {
  id?: number
  name?: string
  moshaf?: RawMoshaf[]
}

const ALL = Array.from({ length: 114 }, (_, i) => i + 1)

const TILAWAT_ROOT = 'https://tilawat.net/mushaf/'
const SOURCE = 'https://tilawat.net/reciter/مشاري-العفاسي/1020'

// Full and partial editions are represented separately.
const TILAWAT = [
  ['21190', 'ابن ذكوان عن ابن عامر', 'مشاري-العفاسي-ابن-ذكوان-عن-ابن-عامر', ALL],
  ['21189', 'شعبة عن عاصم', 'مشاري-العفاسي-شعبة-عن-عاصم', ALL],
  ['20045', 'حفص عن عاصم — مرتل', 'مشاري-العفاسي-حفص-عن-عاصم', ALL],
  ['21187', 'حفص عن عاصم — المعلم', 'مشاري-العفاسي-حفص-عن-عاصم-معلم', ALL],
  ['21188', 'الدوري عن الكسائي — التسجيل الثاني', 'مشاري-العفاسي-الدوري-عن-الكسائي-التسجيل-2', ALL],
  ['21889', 'إسحاق وإدريس عن خلف', 'مشاري-العفاسي-إسحاق-وإدريس-عن-خلف', ALL],
  ['21183', 'ورش عن نافع', 'مشاري-العفاسي-ورش-عن-نافع', [18, 75]],
  ['21184', 'قنبل عن ابن كثير', 'مشاري-العفاسي-قنبل-عن-ابن-كثير', [1, 2]],
  ['21191', 'السوسي عن أبي عمرو', 'مشاري-العفاسي-السوسي-عن-أبي-عمرو', [50, 51, 52, 53, 54, 55, 56, 57]],
  ['21192', 'خلف عن حمزة', 'مشاري-العفاسي-خلف-عن-حمزة', [19, 20, 37, 52]],
  ['21185', 'أبو الحارث عن الكسائي', 'مشاري-العفاسي-أبو-الحارث-عن-الكسائي', [1, 2]],
  ['20046', 'الدوري عن الكسائي — تلاوات متفرقة', 'مشاري-العفاسي-الدوري-عن-الكسائي', [12, 14, 25, 87, 97, 99]],
  ['21186', 'رويس عن يعقوب', 'مشاري-العفاسي-رويس-عن-يعقوب', [51, 83]],
] as const

const ASSABILE = [
  ['shuba-murattal', 'شعبة عن عاصم — تلاوات السبيل', [1, 18, 19, 20, 87, 109]],
  ['warsh-murattal', 'ورش عن نافع — تلاوات السبيل', [1, 12]],
  ['khalaf-hamza-murattal', 'خلف عن حمزة — تلاوات السبيل', [19, 20, 36, 37, 51, 52, 53, 77, 79, 85, 86, 89, 91, 92, 93, 95, 100, 103]],
  ['duri-kisai-murattal', 'الدوري عن الكسائي — تلاوات السبيل', [1, 14, 25, 87, 97, 99]],
  ['bazzi-qunbul-murattal', 'البزي وقنبل عن ابن كثير — تلاوات السبيل', [1, 18, 55, 67, 69]],
] as const

const assabile: Edition[] = ASSABILE.map(
  ([slug, name, surahIds]) => ({
    id: `assabile-${slug}`,
    name,
    source: 'السبيل',
    sourceUrl:
      `https://ar.assabile.com/mishary-rashid-alafasy/moshaf/${slug}`,
    surahIds: [...surahIds],
  })
)

const way2quran: Edition[] = [
  {
    id: 'way2quran-duri-abu-amr',
    name: 'الدوري عن أبي عمرو — الطريق إلى القرآن',
    source: 'الطريق إلى القرآن',
    sourceUrl:
      'https://stg-way.way2quran.com/ar/reciters/mishary-alafasy?recitationSlug=ad-duri-an-abu-amr',
    surahIds: ALL,
  },
]

const curated: Edition[] = TILAWAT.map(
  ([id, name, slug, ids]) => ({
    id: `tilawat-${id}`,
    name,
    source: 'تلاوات',
    sourceUrl:
      `${TILAWAT_ROOT}${encodeURIComponent(slug)}/${id}`,
    surahIds: [...ids],
  })
)

function validServer(value: unknown): string | null {
  if (typeof value !== 'string') return null

  try {
    const url = new URL(value)

    if (
      url.protocol !== 'https:' ||
      !/^(?:[a-z\d-]+\.)*mp3quran\.net$/i.test(url.hostname) ||
      url.port ||
      url.username ||
      url.password
    ) {
      return null
    }

    return url.href.replace(/\/?$/, '/')
  } catch {
    return null
  }
}

function parseSurahs(value: unknown): number[] {
  if (typeof value !== 'string') return []

  return [
    ...new Set(
      value
        .split(',')
        .map(Number)
        .filter(
          n =>
            Number.isInteger(n) &&
            n >= 1 &&
            n <= 114
        )
    ),
  ].sort((a, b) => a - b)
}

async function mp3quran(): Promise<Edition[]> {
  try {
    const response = await fetch(
      'https://mp3quran.net/api/v3/reciters?language=ar&reciter=123',
      {
        signal: AbortSignal.timeout(9000),
        next: { revalidate: 1800 },
      }
    )

    if (!response.ok) return []

    const payload = (await response.json()) as {
      reciters?: RawReciter[]
    }

    const reciter = payload.reciters?.find(
      r => r.id === 123 && /العفاسي/.test(r.name ?? '')
    )

    if (!reciter) return []

    return (reciter.moshaf ?? []).flatMap(m => {
      const server = validServer(m.server)
      const surahIds = parseSurahs(m.surah_list)

      if (
        !server ||
        !surahIds.length ||
        !Number.isSafeInteger(m.id)
      ) {
        return []
      }

      return [
        {
          id: `mp3quran-${m.id}`,
          name: m.name || 'تسجيل العفاسي',
          source: 'MP3Quran',
          sourceUrl: 'https://mp3quran.net/ar',
          server,
          surahIds,
        },
      ]
    })
  } catch {
    return []
  }
}

function isAllowedAudio(url: string): boolean {
  try {
    const u = new URL(url)

    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.port &&
      /^(?:[a-z\d-]+\.)*(?:mp3quran\.net|quranicaudio\.com|way2quran\.com|assabile\.com)$/i.test(
        u.hostname
      ) &&
      /\.mp3(?:$|\?)/i.test(u.pathname + u.search)
    )
  } catch {
    return false
  }
}

async function resolveTilawat(
  edition: Edition,
  surah: number
): Promise<{
  audioUrl: string | null
  sourceUrl: string
}> {
  const index = edition.surahIds.indexOf(surah)

  if (index < 0) {
    return {
      audioUrl: null,
      sourceUrl: edition.sourceUrl,
    }
  }

  try {
    const page = await fetch(edition.sourceUrl, {
      signal: AbortSignal.timeout(11000),
      next: { revalidate: 3600 },
    })

    if (!page.ok) throw new Error('Source unavailable')

    const html = await page.text()

    const links = [
      ...new Set(
        [...html.matchAll(/href=["']([^"']*\/recitation\/[^"']+)["']/g)]
          .map(m => m[1].replace(/&amp;/g, '&'))
      ),
    ]

    if (links.length !== edition.surahIds.length) {
      return {
        audioUrl: null,
        sourceUrl: edition.sourceUrl,
      }
    }

    const recitationUrl = new URL(
      links[index],
      'https://tilawat.net'
    )

    if (
      recitationUrl.hostname !== 'tilawat.net' ||
      !recitationUrl.pathname.startsWith('/recitation/')
    ) {
      return {
        audioUrl: null,
        sourceUrl: edition.sourceUrl,
      }
    }

    const detail = await fetch(recitationUrl, {
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 3600 },
    })

    if (!detail.ok) {
      return {
        audioUrl: null,
        sourceUrl: recitationUrl.href,
      }
    }

    const content = (await detail.text())
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&')

    const possible = [
      ...new Set(
        content.match(
          /https:\/\/[^\s"'<>\\]+?\.mp3(?:\?[^\s"'<>\\]*)?/g
        ) ?? []
      ),
    ].filter(isAllowedAudio)

    return {
      audioUrl:
        possible.length === 1 ? possible[0] : null,
      sourceUrl: recitationUrl.href,
    }
  } catch {
    return {
      audioUrl: null,
      sourceUrl: edition.sourceUrl,
    }
  }
}

async function resolveAssabile(
  edition: Edition,
  surah: number
): Promise<{
  audioUrl: string | null
  sourceUrl: string
}> {
  try {
    const response = await fetch(edition.sourceUrl, {
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      return {
        audioUrl: null,
        sourceUrl: edition.sourceUrl,
      }
    }

    const html = await response.text()

    const links = [
      ...new Set(
        [...html.matchAll(/href=["']([^"']*\/mishary-rashid-alafasy\/quran\/[^"']+)["']/g)]
          .map(m => m[1].replace(/&amp;/g, '&'))
      ),
    ]

    if (links.length !== edition.surahIds.length) {
      return {
        audioUrl: null,
        sourceUrl: edition.sourceUrl,
      }
    }

    const detailUrl = new URL(
      links[edition.surahIds.indexOf(surah)],
      'https://ar.assabile.com'
    )

    if (
      detailUrl.hostname !== 'ar.assabile.com' ||
      !detailUrl.pathname.startsWith(
        '/mishary-rashid-alafasy/quran/'
      )
    ) {
      return {
        audioUrl: null,
        sourceUrl: edition.sourceUrl,
      }
    }

    const detail = await fetch(detailUrl, {
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 3600 },
    })

    if (!detail.ok) {
      return {
        audioUrl: null,
        sourceUrl: detailUrl.href,
      }
    }

    const content = (await detail.text())
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&')

    const possible = [
      ...new Set(
        content.match(
          /https:\/\/[^\s"'<>\\]+?\.mp3(?:\?[^\s"'<>\\]*)?/g
        ) ?? []
      ),
    ].filter(isAllowedAudio)

    return {
      audioUrl:
        possible.length === 1 ? possible[0] : null,
      sourceUrl: detailUrl.href,
    }
  } catch {
    return {
      audioUrl: null,
      sourceUrl: edition.sourceUrl,
    }
  }
}

export async function GET(
  request: Request
): Promise<Response> {
  const { searchParams } = new URL(request.url)

  const editions = [
    ...curated,
    ...assabile,
    ...way2quran,
    ...(await mp3quran()),
  ]

  const resolve = searchParams.get('resolve')

  if (resolve) {
    const surah = Number(searchParams.get('surah'))
    const edition = editions.find(e => e.id === resolve)

    if (
      !edition ||
      !Number.isInteger(surah) ||
      !edition.surahIds.includes(surah)
    ) {
      return NextResponse.json(
        { error: 'هذا التسجيل غير موجود.' },
        { status: 404 }
      )
    }

    const audioUrl = edition.server
      ? `${edition.server}${String(surah).padStart(3, '0')}.mp3`
      : null

    const result = audioUrl
      ? { audioUrl, sourceUrl: edition.sourceUrl }
      : edition.source === 'السبيل'
        ? await resolveAssabile(edition, surah)
        : edition.source === 'تلاوات'
          ? await resolveTilawat(edition, surah)
          : {
              audioUrl: null,
              sourceUrl: edition.sourceUrl,
            }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, s-maxage=300',
      },
    })
  }

  return NextResponse.json(
    {
      reciter: 'مشاري راشد العفاسي',
      editions,
      source: SOURCE,
    },
    {
      headers: {
        'Cache-Control':
          'public, s-maxage=600, stale-while-revalidate=1800',
      },
    }
  )
}
