
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type Edition = {
  id: number
  name: string
  server: string
  surahIds: number[]
}

type Surah = {
  id: number
  name: string
}

type Catalog = {
  reciter: string
  editions: Edition[]
  surahs: Surah[]
}

type Selection = {
  editionId: number
  surahId: number
}

const SAVED_CATALOG =
  'samee3-alafasy-riwayat-catalog-v1'

const EXTERNAL = [
  {
    name: 'ورش عن نافع',
    count: 2,
    url: 'https://ar.assabile.com/mishary-rashid-alafasy/moshaf/warsh-murattal',
  },
  {
    name: 'شعبة عن عاصم',
    count: 6,
    url: 'https://ar.assabile.com/mishary-rashid-alafasy/moshaf/shuba-murattal',
  },
  {
    name: 'البزي وقنبل عن ابن كثير',
    count: 5,
    url: 'https://ar.assabile.com/mishary-rashid-alafasy/moshaf/bazzi-qunbul-murattal',
  },
  {
    name: 'الدوري عن الكسائي',
    count: 6,
    url: 'https://ar.assabile.com/mishary-rashid-alafasy/moshaf/duri-kisai-murattal',
  },
] as const

function isCatalog(value: unknown): value is Catalog {
  if (!value || typeof value !== 'object') {
    return false
  }

  const row = value as Partial<Catalog>

  return (
    typeof row.reciter === 'string' &&
    Array.isArray(row.editions) &&
    Array.isArray(row.surahs)
  )
}

export default function AlafasyRiwayatPage() {
  const [catalog, setCatalog] =
    useState<Catalog | null>(null)

  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const [editionId, setEditionId] =
    useState<number | null>(null)

  const [selection, setSelection] =
    useState<Selection | null>(null)

  const [search, setSearch] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(SAVED_CATALOG) || 'null'
      )

      if (isCatalog(saved)) {
        setCatalog(saved)
      }
    } catch {
      // Storage may be disabled.
    }

    fetch('/api/alafasy-riwayat', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async response => {
        const result: unknown = await response.json()

        if (!response.ok || !isCatalog(result)) {
          throw new Error('Invalid catalog')
        }

        return result
      })
      .then(result => {
        if (controller.signal.aborted) return

        setCatalog(result)
        setNotice('')

        try {
          localStorage.setItem(
            SAVED_CATALOG,
            JSON.stringify(result)
          )
        } catch {
          // Ignore quota.
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setNotice(
            'تعذر تحديث القائمة الآن. التسجيلات القديمة تظهر إذا كانت محفوظة.'
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [])

  const edition = useMemo(
    () =>
      catalog?.editions.find(
        item => item.id === editionId
      ) ||
      catalog?.editions[0] ||
      null,
    [catalog, editionId]
  )

  const surahNames = useMemo(
    () =>
      new Map(
        (catalog?.surahs || []).map(surah => [
          surah.id,
          surah.name,
        ])
      ),
    [catalog]
  )

  const available = useMemo(
    () =>
      (edition?.surahIds || []).filter(
        id =>
          !search.trim() ||
          String(id).includes(search.trim()) ||
          (surahNames.get(id) || '').includes(
            search.trim()
          )
      ),
    [edition, search, surahNames]
  )

  const selectedEdition = catalog?.editions.find(
    item => item.id === selection?.editionId
  )

  const audioUrl =
    selectedEdition &&
    selection &&
    selectedEdition.surahIds.includes(
      selection.surahId
    )
      ? `${selectedEdition.server}${String(
          selection.surahId
        ).padStart(3, '0')}.mp3`
      : null

  return (
    <main
      dir="rtl"
      className="mx-auto min-h-screen max-w-5xl px-4 py-7 text-slate-900 dark:text-slate-100"
    >
      <div className="rounded-3xl bg-emerald-950 px-6 py-8 text-white shadow-xl">
        <p className="text-sm text-emerald-200">
          مصحف سميع • المكتبة الصوتية
        </p>

        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
          مصحف الروايات — مشاري راشد العفاسي
        </h1>

        <p className="mt-3 text-sm leading-7 text-emerald-100">
          التلاوات تُقرأ من فهرس MP3Quran الرسمي.
          تظهر السور المتاحة لكل مصحف فقط،
          ولن تُعرض السور غير المسجلة على أنها متوفرة.
        </p>
      </div>

      {notice && (
        <p
          role="status"
          className="my-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          {notice}
        </p>
      )}

      {loading && !catalog && (
        <p className="my-6 text-center">
          جارٍ تحميل تسجيلات العفاسي...
        </p>
      )}

      {!loading && !catalog && (
        <p className="my-6 rounded-xl border p-4">
          القائمة غير متوفرة الآن.
          يلزم الاتصال بالإنترنت أول مرة.
        </p>
      )}

      {catalog && (
        <section className="my-6 space-y-5">
          <div className="flex flex-wrap gap-2">
            {catalog.editions.map(item => (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  setEditionId(item.id)
                  setSelection(null)
                  setSearch('')
                }}
                aria-pressed={edition?.id === item.id}
                className={`rounded-2xl border px-4 py-3 text-right text-sm transition ${
                  edition?.id === item.id
                    ? 'border-emerald-700 bg-emerald-700 text-white'
                    : 'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white'
                }`}
              >
                <strong className="block">
                  {item.name}
                </strong>

                <span className="mt-1 block opacity-80">
                  {item.surahIds.length} من 114 سورة
                </span>
              </button>
            ))}
          </div>

          {catalog.editions.length === 0 && (
            <p className="rounded-2xl border p-4">
              لم يُرجع المصدر تسجيلات مؤكدة
              للعفاسي حاليًا.
            </p>
          )}

          {edition && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-bold">
                {edition.name}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                التسجيلات المتاحة:{' '}
                {edition.surahIds.length} سورة
              </p>

              <input
                type="search"
                value={search}
                onChange={event =>
                  setSearch(event.target.value)
                }
                placeholder="ابحث باسم السورة أو رقمها"
                aria-label="ابحث عن سورة"
                className="my-4 w-full rounded-xl border border-slate-300 bg-transparent p-3 outline-emerald-600 dark:border-slate-700"
              />

              <div className="grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {available.map(id => (
                  <button
                    type="button"
                    key={id}
                    onClick={() =>
                      setSelection({
                        editionId: edition.id,
                        surahId: id,
                      })
                    }
                    className={`flex items-center justify-between rounded-xl border p-3 text-right ${
                      selection?.editionId ===
                        edition.id &&
                      selection.surahId === id
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <span>
                      {id}.{' '}
                      {surahNames.get(id) ||
                        `سورة ${id}`}
                    </span>

                    <span>استماع ◀</span>
                  </button>
                ))}

                {!available.length && (
                  <p className="p-4 text-sm">
                    لا توجد سورة بهذا الاسم
                    ضمن التسجيلات المتاحة.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {audioUrl && selection && (
        <section className="sticky bottom-3 z-20 rounded-2xl border border-emerald-700/20 bg-white p-4 shadow-xl dark:bg-slate-900">
          <p className="mb-2 font-semibold">
            {surahNames.get(selection.surahId) ||
              `سورة ${selection.surahId}`}
            {' — '}
            {selectedEdition?.name}
          </p>

          <audio
            key={audioUrl}
            src={audioUrl}
            controls
            preload="none"
            className="w-full"
          />

          <a
            href={audioUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-medium text-emerald-700 underline dark:text-emerald-300"
          >
            فتح ملف التلاوة
          </a>
        </section>
      )}

      <section className="my-7 rounded-2xl border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="text-lg font-bold">
          تلاوات إضافية للعفاسي بروايات مختلفة
        </h2>

        <p className="my-2 text-sm leading-7 text-slate-600 dark:text-slate-300">
          هذه روابط لمصادر خارجية موثقة،
          وليست ملفات صوتية مدمجة في سميع
          حتى الآن. بعض هذه الروايات غير مكتمل؛
          لذلك يظهر عدد السور المنشور في المصدر.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {EXTERNAL.map(item => (
            <a
              key={item.name}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-slate-200 p-4 hover:border-emerald-600 dark:border-slate-700"
            >
              <strong className="block">
                {item.name}
              </strong>

              <span className="text-sm text-slate-500">
                {item.count} سورة — فتح المصدر الخارجي
              </span>
            </a>
          ))}
        </div>
      </section>

      <Link
        href="/audio"
        className="inline-block rounded-xl border border-emerald-700 px-5 py-3 text-sm text-emerald-800 dark:text-emerald-200"
      >
        العودة للمكتبة الصوتية
      </Link>
    </main>
  )
}
