
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

type RawSurah = {
  id?: number
  name?: string
}

function audioServer(value: unknown): string | null {
  if (typeof value !== 'string') return null

  try {
    const url = new URL(value)

    if (
      url.protocol !== 'https:' ||
      !/^([a-z0-9-]+\.)*mp3quran\.net$/i.test(url.hostname)
    ) {
      return null
    }

    if (url.username || url.password || url.port) return null

    return url.href.endsWith('/')
      ? url.href
      : `${url.href}/`
  } catch {
    return null
  }
}

function surahIds(value: unknown): number[] {
  if (typeof value !== 'string') return []

  return Array.from(
    new Set(
      value
        .split(',')
        .map(item => Number(item.trim()))
        .filter(
          number =>
            Number.isInteger(number) &&
            number >= 1 &&
            number <= 114
        )
    )
  ).sort((a, b) => a - b)
}

async function loadJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  })

  if (!response.ok) {
    throw new Error(`MP3Quran HTTP ${response.status}`)
  }

  return response.json() as Promise<unknown>
}

export async function GET(): Promise<Response> {
  try {
    const base = 'https://mp3quran.net/api/v3'

    const [reciterPayload, surahPayload] = await Promise.all([
      loadJson(`${base}/reciters?language=ar&reciter=123`),
      loadJson(`${base}/suwar?language=ar`).catch(() => null),
    ])

    const reciterRows = (
      reciterPayload as { reciters?: RawReciter[] } | null
    )?.reciters

    const reciter = Array.isArray(reciterRows)
      ? reciterRows.find(
          row =>
            row?.id === 123 &&
            typeof row.name === 'string' &&
            /العفاسي/.test(row.name)
        )
      : undefined

    if (!reciter) {
      return NextResponse.json(
        {
          error: 'تعذر تأكيد بيانات مشاري العفاسي من المصدر.',
        },
        { status: 502 }
      )
    }

    const editions = (
      Array.isArray(reciter.moshaf) ? reciter.moshaf : []
    ).flatMap(moshaf => {
      const server = audioServer(moshaf.server)
      const ids = surahIds(moshaf.surah_list)

      if (
        !server ||
        ids.length === 0 ||
        !Number.isSafeInteger(moshaf.id)
      ) {
        return []
      }

      return [
        {
          id: Number(moshaf.id),
          name: String(
            moshaf.name || 'تلاوة غير مسماة'
          ),
          server,
          surahIds: ids,
        },
      ]
    })

    const rawSurahs = (
      surahPayload as { suwar?: RawSurah[] } | null
    )?.suwar

    const surahs = Array.isArray(rawSurahs)
      ? rawSurahs
          .filter(
            surah =>
              Number.isInteger(surah.id) &&
              typeof surah.name === 'string'
          )
          .map(surah => ({
            id: Number(surah.id),
            name: String(surah.name),
          }))
      : []

    return NextResponse.json(
      {
        reciter: reciter.name,
        editions,
        surahs,
      },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    )
  } catch (error) {
    console.error('Alafasy riwayat catalog:', error)

    return NextResponse.json(
      {
        error: 'تعذر الاتصال بفهرس المصاحف الصوتية.',
      },
      { status: 503 }
    )
  }
}
