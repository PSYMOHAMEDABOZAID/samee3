
'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

type Edition = {
  id: string
  name: string
  source: string
  sourceUrl: string
  surahIds: number[]
  server?: string
}

type Catalog = {
  reciter: string
  editions: Edition[]
}

type Playing = {
  id: string
  surah: number
  url: string
}

const CATALOG_KEY = 'samee3-riwayat-catalog-v3'
const AUDIO_CACHE = 'samee3-riwayat-audio-v1'

const SURAH_NAMES = 'الفاتحة,البقرة,آل عمران,النساء,المائدة,الأنعام,الأعراف,الأنفال,التوبة,يونس,هود,يوسف,الرعد,إبراهيم,الحجر,النحل,الإسراء,الكهف,مريم,طه,الأنبياء,الحج,المؤمنون,النور,الفرقان,الشعراء,النمل,القصص,العنكبوت,الروم,لقمان,السجدة,الأحزاب,سبأ,فاطر,يس,الصافات,ص,الزمر,غافر,فصلت,الشورى,الزخرف,الدخان,الجاثية,الأحقاف,محمد,الفتح,الحجرات,ق,الذاريات,الطور,النجم,القمر,الرحمن,الواقعة,الحديد,المجادلة,الحشر,الممتحنة,الصف,الجمعة,المنافقون,التغابن,الطلاق,التحريم,الملك,القلم,الحاقة,المعارج,نوح,الجن,المزمل,المدثر,القيامة,الإنسان,المرسلات,النبأ,النازعات,عبس,التكوير,الانفطار,المطففين,الانشقاق,البروج,الطارق,الأعلى,الغاشية,الفجر,البلد,الشمس,الليل,الضحى,الشرح,التين,العلق,القدر,البينة,الزلزلة,العاديات,القارعة,التكاثر,العصر,الهمزة,الفيل,قريش,الماعون,الكوثر,الكافرون,النصر,المسد,الإخلاص,الفلق,الناس'.split(',')

const surahName = (id: number) =>
  SURAH_NAMES[id - 1] || `سورة ${id}`

const storedKey = (
  edition: string,
  surah: number
) =>
  `/audio/alafasy-riwayat/offline/${encodeURIComponent(
    edition
  )}/${String(surah).padStart(3, '0')}.mp3`

function validCatalog(input: unknown): input is Catalog {
  if (!input || typeof input !== 'object') {
    return false
  }

  const value = input as Partial<Catalog>

  return (
    typeof value.reciter === 'string' &&
    Array.isArray(value.editions) &&
    value.editions.every(
      e =>
        typeof e.id === 'string' &&
        typeof e.name === 'string' &&
        typeof e.sourceUrl === 'string' &&
        Array.isArray(e.surahIds)
    )
  )
}

async function resolveAudio(
  edition: string,
  surah: number
) {
  const response = await fetch(
    `/api/alafasy-riwayat?resolve=${encodeURIComponent(
      edition
    )}&surah=${surah}`,
    { cache: 'no-store' }
  )

  if (!response.ok) {
    throw new Error('تعذر الوصول إلى مصدر التلاوة.')
  }

  return response.json() as Promise<{
    audioUrl: string | null
    sourceUrl: string
  }>
}

export default function AlafasyRiwayatPage() {
  const [catalog, setCatalog] =
    useState<Catalog | null>(null)

  const [editionId, setEditionId] = useState('')
  const [search, setSearch] = useState('')

  const [playing, setPlaying] =
    useState<Playing | null>(null)

  const [saved, setSaved] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [sourceLink, setSourceLink] = useState('')

  const objectUrl = useRef<string | null>(null)

  const releaseObjectUrl = useCallback(() => {
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = null
    }
  }, [])

  useEffect(() => {
    let active = true

    try {
      const cached: unknown = JSON.parse(
        localStorage.getItem(CATALOG_KEY) || 'null'
      )

      if (validCatalog(cached)) {
        setCatalog(cached)
      }
    } catch {
      // Private browsing may disable storage.
    }

    fetch('/api/alafasy-riwayat', {
      cache: 'no-store',
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error('Catalog unavailable')
        }

        return response.json() as Promise<unknown>
      })
      .then(result => {
        if (!active || !validCatalog(result)) return

        setCatalog(result)

        try {
          localStorage.setItem(
            CATALOG_KEY,
            JSON.stringify(result)
          )
        } catch {
          // Storage quota.
        }
      })
      .catch(() => {
        if (active) {
          setNotice(
            'تعذر تحديث الفهرس. تظهر البيانات المحفوظة إن وُجدت.'
          )
        }
      })

    return () => {
      active = false
      releaseObjectUrl()
    }
  }, [releaseObjectUrl])

  const edition = useMemo(
    () =>
      catalog?.editions.find(
        e => e.id === editionId
      ) ||
      catalog?.editions[0] ||
      null,
    [catalog, editionId]
  )

  const refreshSaved = useCallback(async () => {
    try {
      if (!('caches' in window)) return

      const cache = await caches.open(AUDIO_CACHE)
      const keys = await cache.keys()

      setSaved(
        keys.map(k => new URL(k.url).pathname)
      )
    } catch {
      setNotice(
        'تعذر قراءة التسجيلات المحلية على الجهاز.'
      )
    }
  }, [])

  useEffect(() => {
    void refreshSaved()
  }, [refreshSaved])

  const isSaved = (
    id: string,
    surah: number
  ) => saved.includes(storedKey(id, surah))

  const show = useMemo(
    () =>
      (edition?.surahIds || []).filter(
        n =>
          !search.trim() ||
          String(n).includes(search.trim()) ||
          surahName(n).includes(search.trim())
      ),
    [edition, search]
  )

  async function play(
    id: string,
    surah: number
  ) {
    const key = storedKey(id, surah)

    setBusy(key)
    setNotice('')
    setSourceLink('')

    try {
      if ('caches' in window) {
        const cache = await caches.open(AUDIO_CACHE)
        const entry = await cache.match(key)

        if (entry) {
          const blob = await entry.blob()

          releaseObjectUrl()

          const localUrl =
            URL.createObjectURL(blob)

          objectUrl.current = localUrl

          setPlaying({
            id,
            surah,
            url: localUrl,
          })

          return
        }
      }

      if (!navigator.onLine) {
        throw new Error(
          'هذه السورة غير محمّلة. اتصل بالإنترنت لتنزيلها أولًا.'
        )
      }

      const result = await resolveAudio(
        id,
        surah
      )

      setSourceLink(result.sourceUrl)

      if (!result.audioUrl) {
        throw new Error(
          'المصدر يؤكد وجود التلاوة، لكن رابط MP3 المباشر لم يُتحقق منه. افتح صفحة المصدر للاستماع أو التحميل.'
        )
      }

      releaseObjectUrl()

      setPlaying({
        id,
        surah,
        url: result.audioUrl,
      })
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'تعذر تشغيل التلاوة.'
      )
    } finally {
      setBusy('')
    }
  }

  async function getFullRecording(
    id: string,
    surah: number
  ): Promise<Blob> {
    if ('caches' in window) {
      const cache = await caches.open(AUDIO_CACHE)

      const existing = await cache.match(
        storedKey(id, surah)
      )

      if (existing) {
        return existing.blob()
      }
    }

    if (!navigator.onLine) {
      throw new Error(
        'يلزم الإنترنت لتنزيل هذه السورة أول مرة.'
      )
    }

    const result = await resolveAudio(id, surah)

    if (!result.audioUrl) {
      setSourceLink(result.sourceUrl)

      throw new Error(
        'لا يوجد رابط MP3 مباشر مؤكّد لهذه التلاوة. استخدم صفحة المصدر.'
      )
    }

    const response = await fetch(
      result.audioUrl,
      {
        mode: 'cors',
        credentials: 'omit',
      }
    )

    if (
      !response.ok ||
      response.status !== 200 ||
      response.type === 'opaque'
    ) {
      throw new Error(
        'المصدر لا يسمح بتنزيل التسجيل من داخل التطبيق. افتح رابط المصدر للتحميل.'
      )
    }

    const type =
      response.headers.get('content-type') || ''

    if (
      type.includes('text/html') ||
      type.includes('application/json')
    ) {
      throw new Error(
        'المصدر أعاد صفحة بدل ملف MP3.'
      )
    }

    return response.blob()
  }

  async function saveOffline(
    id: string,
    surah: number
  ) {
    const key = storedKey(id, surah)

    setBusy(key)
    setNotice('')
    setSourceLink('')

    try {
      if (!('caches' in window)) {
        throw new Error(
          'المتصفح لا يدعم التخزين المحلي للتلاوات.'
        )
      }

      const cache = await caches.open(AUDIO_CACHE)

      if (await cache.match(key)) {
        setNotice(
          'التلاوة محفوظة بالفعل على هذا الجهاز.'
        )
        return
      }

      if (!navigator.onLine) {
        throw new Error(
          'يلزم الإنترنت لحفظ السورة أول مرة.'
        )
      }

      const resolved = await resolveAudio(
        id,
        surah
      )

      setSourceLink(resolved.sourceUrl)

      if (!resolved.audioUrl) {
        throw new Error(
          'المصدر لا يوفر رابط MP3 مباشرًا قابلًا للتحقق، افتح المصدر لحفظه على جهازك.'
        )
      }

      const response = await fetch(
        resolved.audioUrl,
        {
          mode: 'cors',
          credentials: 'omit',
        }
      )

      if (
        !response.ok ||
        response.status !== 200 ||
        response.type === 'opaque'
      ) {
        throw new Error(
          'تعذر حفظ MP3 من المصدر داخل التطبيق. استخدم رابط المصدر.'
        )
      }

      const type =
        response.headers.get('content-type') || ''

      if (
        type.includes('text/html') ||
        type.includes('application/json')
      ) {
        throw new Error(
          'المصدر أعاد صفحة HTML بدل ملف MP3.'
        )
      }

      await cache.put(key, response)

      await refreshSaved()

      setNotice(
        'تم حفظ التلاوة داخل سميع للاستماع دون إنترنت على هذا الجهاز.'
      )
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'فشل الحفظ. ربما مساحة الجهاز غير كافية.'
      )
    } finally {
      setBusy('')
    }
  }

  async function saveToDevice(
    id: string,
    surah: number
  ) {
    const key = storedKey(id, surah)

    setBusy(key)
    setNotice('')
    setSourceLink('')

    try {
      const blob = await getFullRecording(
        id,
        surah
      )

      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')

      a.href = url
      a.download =
        `Alafasy-${id}-${String(surah).padStart(3, '0')}.mp3`

      document.body.appendChild(a)
      a.click()
      a.remove()

      window.setTimeout(
        () => URL.revokeObjectURL(url),
        60000
      )

      setNotice(
        'بدأ طلب تنزيل MP3. على iPhone قد تحتاج إلى اختيار حفظ في الملفات من قائمة المشاركة.'
      )
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'تعذر تنزيل الملف.'
      )
    } finally {
      setBusy('')
    }
  }

  async function removeOffline(
    id: string,
    surah: number
  ) {
    try {
      const cache = await caches.open(AUDIO_CACHE)

      await cache.delete(
        storedKey(id, surah)
      )

      await refreshSaved()

      setNotice(
        'تم حذف النسخة المحلية فقط.'
      )
    } catch {
      setNotice(
        'تعذر حذف الملف المحلي.'
      )
    }
  }

  return (
    <main
      dir="rtl"
      className="mx-auto min-h-screen max-w-5xl space-y-5 px-4 py-7 text-slate-900 dark:text-slate-100"
    >
      <header className="rounded-3xl bg-emerald-950 px-6 py-7 text-white">
        <p className="text-sm text-emerald-200">
          مصحف سميع — المكتبة الصوتية
        </p>

        <h1 className="mt-2 text-2xl font-bold">
          مصحف روايات مشاري راشد العفاسي
        </h1>

        <p className="mt-2 text-sm leading-7 text-emerald-100">
          المصاحف الكاملة والجزئية، من مصادر متعددة.
          الحفظ داخل سميع مستقل عن تنزيل MP3
          إلى ملفات جهازك.
        </p>
      </header>

      {notice && (
        <div
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {notice}

          {sourceLink && (
            <a
              className="mr-2 font-bold underline"
              href={sourceLink}
              target="_blank"
              rel="noreferrer"
            >
              فتح المصدر الأصلي
            </a>
          )}
        </div>
      )}

      {!catalog && (
        <p>
          جارٍ تحميل الفهرس... يلزم الاتصال
          بالإنترنت أول مرة.
        </p>
      )}

      {catalog && (
        <>
          <p className="text-sm text-slate-500">
            {catalog.editions.length} إصدارات
            مدرجة من المصادر المتاحة؛ التسجيلات
            المحفوظة فقط تعمل دون إنترنت.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {catalog.editions.map(item => (
              <button
                key={item.id}
                type="button"
                aria-pressed={
                  edition?.id === item.id
                }
                onClick={() => {
                  setEditionId(item.id)
                  setSearch('')
                  setSourceLink('')
                }}
                className={`rounded-xl border p-3 text-right ${
                  edition?.id === item.id
                    ? 'border-emerald-600 bg-emerald-700 text-white'
                    : 'bg-white dark:bg-slate-900'
                }`}
              >
                <span className="block font-semibold">
                  {item.name}
                </span>

                <span className="block text-xs opacity-80">
                  {item.source} — {item.surahIds.length} سورة
                </span>
              </button>
            ))}
          </div>

          {edition && (
            <section className="rounded-2xl border bg-white p-4 dark:bg-slate-900">
              <h2 className="text-xl font-bold">
                {edition.name}
              </h2>

              <p className="text-sm text-slate-500">
                {edition.source} •{' '}
                {edition.surahIds.length} تسجيل
              </p>

              <a
                className="my-3 inline-block text-sm text-emerald-700 underline dark:text-emerald-300"
                href={edition.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                عرض المصحف في المصدر الأصلي
              </a>

              <input
                value={search}
                onChange={event =>
                  setSearch(event.target.value)
                }
                placeholder="ابحث باسم السورة أو رقمها"
                aria-label="بحث عن سورة"
                className="mb-3 block w-full rounded-xl border p-3 text-slate-900"
              />

              <div className="max-h-[550px] space-y-2 overflow-y-auto">
                {show.map(surah => {
                  const key = storedKey(
                    edition.id,
                    surah
                  )

                  const active = busy === key

                  return (
                    <div
                      key={surah}
                      className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
                    >
                      <span className="min-w-24 flex-1 font-semibold">
                        {surah}. {surahName(surah)}
                      </span>

                      {isSaved(edition.id, surah) && (
                        <span className="text-xs text-emerald-700">
                          محفوظة ✓
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void play(edition.id, surah)
                        }
                        className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white"
                      >
                        استماع
                      </button>

                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void saveOffline(
                            edition.id,
                            surah
                          )
                        }
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        {active
                          ? 'جارٍ التحميل...'
                          : 'حفظ دون نت'}
                      </button>

                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void saveToDevice(
                            edition.id,
                            surah
                          )
                        }
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        تنزيل MP3
                      </button>

                      {isSaved(
                        edition.id,
                        surah
                      ) && (
                        <button
                          type="button"
                          onClick={() =>
                            void removeOffline(
                              edition.id,
                              surah
                            )
                          }
                          className="text-xs text-red-700 underline"
                        >
                          حذف المحفوظ
                        </button>
                      )}
                    </div>
                  )
                })}

                {!show.length && (
                  <p>
                    لا توجد سورة مطابقة للبحث
                    في هذا الإصدار.
                  </p>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {playing && (
        <section className="sticky bottom-2 z-10 rounded-2xl border bg-white p-4 shadow-xl dark:bg-slate-900">
          <p className="mb-2 font-semibold">
            {surahName(playing.surah)}
            {' — '}
            {catalog?.editions.find(
              e => e.id === playing.id
            )?.name}
          </p>

          <audio
            key={playing.url}
            controls
            autoPlay
            preload="metadata"
            src={playing.url}
            onError={() =>
              setNotice(
                'لم يتمكن المشغل من قراءة الملف. جرّب رابط المصدر أو ملفًا محفوظًا.'
              )
            }
            className="w-full"
          />
        </section>
      )}

      <p className="text-xs leading-6 text-slate-500">
        التسجيلات التي لا يتيح مصدرها رابط
        MP3 قابلًا للتحقق أو التحميل من
        المتصفح يظهر لها رابط المصدر بدل
        تشغيل رواية أخرى بالخطأ. لا تُحمّل
        الملفات إلا عند اختيار الحفظ.
      </p>

      <Link
        href="/audio"
        className="inline-block rounded-xl border px-4 py-2"
      >
        العودة إلى المكتبة الصوتية
      </Link>
    </main>
  )
}
