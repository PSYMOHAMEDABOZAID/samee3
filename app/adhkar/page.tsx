'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BookHeart,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CloudOff,
  Headphones,
  Heart,
  Loader2,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Volume2,
  X,
} from 'lucide-react'
import {
  findAdhkarCategory,
  loadAdhkarCatalog,
  normalizeAdhkarSearch,
  readCachedAdhkar,
  type AdhkarCategory,
  type AdhkarDailyType,
} from '@/lib/adhkar-catalog'

import { listAdhkarReciters, findAdhkarRecording } from '@/lib/adhkar-reciters'

type DailyId = AdhkarDailyType

type LoadStatus =
  | 'loading'
  | 'online'
  | 'offline'
  | 'error'

type Reciter = {
  id: string
  name: string
  sections: DailyId[]
  individual?: boolean
}

type DailyCard = {
  id: DailyId
  title: string
  description: string
  icon: 'sun' | 'moon' | 'sleep' | 'waking'
}

const READER_KEY = 'samee3_adhkar_reciter'
const LAST_SECTION_KEY = 'samee3_adhkar_last_opened_v1'

// SAMEE3 ADHKAR OFFLINE: لا نعرض قارئًا ليس له تسجيل صوتي محدد.
// القارئ صاحب التسجيلات الفردية يظهر لاحقًا إذا توفر صوت حقيقي للباب.
const RECITERS: Reciter[] = listAdhkarReciters().map((reciter) => ({
  id: reciter.id,
  name: reciter.name,
  individual: reciter.individualAudio,
  sections: (['morning', 'evening', 'sleep', 'waking'] as DailyId[]).filter(
    (type) => Boolean(findAdhkarRecording(reciter.id, type, { allowCombined: true })),
  ),
}))

const DAILY: DailyCard[] = [
  {
    id: 'morning',
    title: 'أذكار الصباح',
    description: 'استفتح يومك بالذكر والسكينة',
    icon: 'sun',
  },
  {
    id: 'evening',
    title: 'أذكار المساء',
    description: 'ختام اليوم بطمأنينة',
    icon: 'moon',
  },
  {
    id: 'sleep',
    title: 'أذكار النوم',
    description: 'أذكار تسبق الراحة والنوم',
    icon: 'sleep',
  },
  {
    id: 'waking',
    title: 'أذكار الاستيقاظ',
    description: 'ابدأ صباحك بحمد الله',
    icon: 'waking',
  },
]

function arNumber(value: number): string {
  return value.toLocaleString('ar-EG')
}

function safeRead(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function safeWrite(
  key: string,
  value: string,
): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    return
  }
}

function objectRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

function localDay(timestamp: number): string {
  const date = new Date(timestamp)

  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ].join('-')
}

function completedItems(
  category: AdhkarCategory | null,
  type: DailyId,
): number {
  if (!category) return 0

  const key =
    `samee3_adhkar_progress_v2_${type}`

  try {
    const parsed: unknown = JSON.parse(
      safeRead(key) || 'null',
    )

    if (
      !objectRecord(parsed) ||
      !objectRecord(parsed.counts)
    ) {
      return 0
    }

    if (
      type === 'morning' ||
      type === 'evening'
    ) {
      if (
        typeof parsed.savedAt !== 'number' ||
        !Number.isFinite(parsed.savedAt) ||
        localDay(parsed.savedAt) !==
          localDay(Date.now())
      ) {
        return 0
      }
    }

    const counts = parsed.counts

    return category.array.filter((item) => {
      return (
        Number(counts[String(item.id)]) === 0
      )
    }).length
  } catch {
    return 0
  }
}

function hasSectionAudio(
  reciter: Reciter,
  type: DailyId,
  category: AdhkarCategory | null,
): boolean {
  if (reciter.sections.includes(type)) {
    return true
  }

  return Boolean(
    reciter.individual &&
      category?.array.some(
        (item) => Boolean(item.audio),
      ),
  )
}

function categoryIcon(name: string) {
  if (
    name.includes('الصباح') ||
    name.includes('الاستيقاظ')
  ) {
    return <Sun size={21} />
  }

  if (
    name.includes('المساء') ||
    name.includes('النوم')
  ) {
    return <Moon size={21} />
  }

  return <BookHeart size={21} />
}

export default function AdhkarPage() {
  const [categories, setCategories] =
    useState<AdhkarCategory[]>([])

  const [status, setStatus] =
    useState<LoadStatus>('loading')

  const [retryIndex, setRetryIndex] =
    useState(0)

  const [search, setSearch] =
    useState('')

  const [readerId, setReaderId] =
    useState(RECITERS[0].id)

  const [audioOnly, setAudioOnly] =
    useState(false)

  const [
    progressVersion,
    setProgressVersion,
  ] = useState(0)

  const [lastSection, setLastSection] =
    useState<DailyId>('morning')

  useEffect(() => {
    const savedReader = safeRead(READER_KEY)

    if (
      RECITERS.some(
        (reader) => reader.id === savedReader,
      )
    ) {
      setReaderId(savedReader)
    }

    const last = safeRead(LAST_SECTION_KEY)

    if (
      last === 'morning' ||
      last === 'evening' ||
      last === 'sleep' ||
      last === 'waking'
    ) {
      setLastSection(last)
    }
  }, [])

  useEffect(() => {
    const update = () => {
      setProgressVersion(
        (current) => current + 1,
      )
    }

    window.addEventListener('focus', update)
    window.addEventListener('pageshow', update)
    window.addEventListener('storage', update)

    document.addEventListener(
      'visibilitychange',
      update,
    )

    return () => {
      window.removeEventListener(
        'focus',
        update,
      )

      window.removeEventListener(
        'pageshow',
        update,
      )

      window.removeEventListener(
        'storage',
        update,
      )

      document.removeEventListener(
        'visibilitychange',
        update,
      )
    }
  }, [])

  useEffect(() => {
    let disposed = false

    const controller =
      new AbortController()

    const run = async () => {
      setStatus('loading')

      const saved =
        await readCachedAdhkar()

      if (disposed) return

      if (saved?.length) {
        setCategories(saved)
        setStatus('offline')
      }

      if (navigator.onLine === false) {
        if (!saved?.length) {
          setStatus('error')
        }

        return
      }

      try {
        const result =
          await loadAdhkarCatalog({
            refresh: true,
            signal: controller.signal,
          })

        if (disposed) return

        setCategories(result.categories)

        setStatus(
          result.origin === 'cache'
            ? 'offline'
            : 'online',
        )
      } catch {
        if (!disposed) {
          setStatus(
            saved?.length
              ? 'offline'
              : 'error',
          )
        }
      }
    }

    void run()

    return () => {
      disposed = true
      controller.abort()
    }
  }, [retryIndex])

  const reader =
    RECITERS.find(
      (entry) => entry.id === readerId,
    ) || RECITERS[0]

  const categoryCount =
    categories.length

  const adhkarCount = useMemo(
    () =>
      categories.reduce(
        (sum, item) =>
          sum + item.array.length,
        0,
      ),
    [categories],
  )

  const daily = useMemo(
    () =>
      DAILY.map((item) => {
        const category =
          findAdhkarCategory(
            categories,
            item.id,
          )

        const total =
          category?.array.length || 0

        const done =
          completedItems(
            category,
            item.id,
          )

        return {
          ...item,
          total,
          done,
          percent: total
            ? Math.round(
                (done / total) * 100,
              )
            : 0,
          recorded: hasSectionAudio(
            reader,
            item.id,
            category,
          ),
        }
      }),
    [
      categories,
      reader,
      progressVersion,
    ],
  )

  const matches = useMemo(() => {
    const term =
      normalizeAdhkarSearch(search)

    return categories
      .map((category) => {
        const matchingItem = term
          ? category.array.find(
              (item) =>
                normalizeAdhkarSearch(
                  item.text,
                ).includes(term),
            )
          : null

        const matchesName =
          normalizeAdhkarSearch(
            category.category,
          ).includes(term)

        const audioItems =
          reader.individual
            ? category.array.filter(
                (item) =>
                  Boolean(item.audio),
              ).length
            : 0

        return {
          category,
          matchingItem,
          matchesName,
          audioItems,
        }
      })
      .filter((entry) => {
        const individualAudio =
          Boolean(
            reader.individual &&
              (
                entry.category.audio ||
                entry.audioItems > 0
              ),
          )

        const sectionAudio =
          DAILY.some((day) => {
            const matched =
              findAdhkarCategory(
                categories,
                day.id,
              )

            return (
              reader.sections.includes(
                day.id,
              ) &&
              matched?.id ===
                entry.category.id
            )
          })

        const recorded =
          individualAudio ||
          sectionAudio

        const matchesSearch =
          !term ||
          entry.matchesName ||
          Boolean(entry.matchingItem)

        return (
          (!audioOnly || recorded) &&
          matchesSearch
        )
      })
  }, [
    categories,
    search,
    audioOnly,
    reader,
  ])

  const lastDaily =
    daily.find(
      (item) =>
        item.id === lastSection,
    ) || daily[0]

  const totalDaily = daily.reduce(
    (sum, entry) =>
      sum + entry.total,
    0,
  )

  const doneDaily = daily.reduce(
    (sum, entry) =>
      sum + entry.done,
    0,
  )

  const dailyPercent = totalDaily
    ? Math.round(
        (doneDaily / totalDaily) * 100,
      )
    : 0

  const changeReader = (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    const value = event.target.value

    if (
      !RECITERS.some(
        (entry) => entry.id === value,
      )
    ) {
      return
    }

    setReaderId(value)
    safeWrite(READER_KEY, value)
  }

  const markOpened = (
    type: DailyId,
  ) => {
    safeWrite(
      LAST_SECTION_KEY,
      type,
    )

    setLastSection(type)
  }

  const retry = useCallback(
    () =>
      setRetryIndex(
        (n) => n + 1,
      ),
    [],
  )

  useEffect(() => {
    const onOnline = () => {
      if (
        status === 'offline' ||
        status === 'error'
      ) {
        retry()
      }
    }

    window.addEventListener(
      'online',
      onOnline,
    )

    return () => {
      window.removeEventListener(
        'online',
        onOnline,
      )
    }
  }, [status, retry])

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#f7f5f0] pb-32 font-sans text-[#213d3f]"
    >
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-7 sm:pt-8">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-[#a7824b]">
              مصحف سميع
              <span className="mx-1 text-[#d2c0a2]">
                /
              </span>
              مكتبتك اليومية
            </p>

            <h1 className="mt-1 text-2xl font-black sm:text-3xl">
              الأذكار والأدعية
            </h1>
          </div>

          <Link
            href="/"
            aria-label="العودة للرئيسية"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#e6d9c7] bg-white shadow-sm transition hover:border-[#c1a26d]"
          >
            <ArrowRight size={21} />
          </Link>
        </header>

        <section className="relative overflow-hidden rounded-[30px] bg-gradient-to-br from-[#123d42] via-[#154f52] to-[#0b2f36] p-6 text-white shadow-[0_18px_50px_rgba(15,62,63,0.18)] sm:p-9">
          <div className="pointer-events-none absolute -left-20 -top-28 h-72 w-72 rounded-full border border-[#ecd1a0]/15" />
          <div className="pointer-events-none absolute -bottom-32 right-20 h-72 w-72 rounded-full border border-[#ecd1a0]/10" />

          <div className="relative z-10 grid items-center gap-6 sm:grid-cols-[1fr_auto]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#ead4a9]/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-[#e9d0a4]">
                <Sparkles size={14} />
                وَاذْكُرْ رَبَّكَ كَثِيرًا
              </span>

              <h2 className="mt-4 text-2xl font-black leading-[1.6] sm:text-3xl">
                سكينة تبدأ بذكر الله
              </h2>

              <p className="mt-2 max-w-lg text-sm leading-8 text-white/75">
                اقرأ أذكارك بتأنٍّ، وتابع
                تكرار كل ذكر، واستمع
                للتسجيلات البشرية عند توفرها.
              </p>

              <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2">
                  {arNumber(categoryCount)}
                  {' '}بابًا
                </span>

                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2">
                  {arNumber(adhkarCount)}
                  {' '}ذكرًا ودعاءً
                </span>

                {status === 'offline' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e8ca93]/20 bg-[#e8ca93]/10 px-3 py-2 text-[#f4deb7]">
                    <CloudOff size={13} />
                    نسخة محفوظة
                  </span>
                )}

                {status === 'online' && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-2 text-emerald-100">
                    <CheckCircle2 size={13} />
                    البيانات جاهزة
                  </span>
                )}
              </div>
            </div>

            <div className="flex h-28 w-28 items-center justify-center rounded-[32px] border border-[#e8cb91]/25 bg-white/10 text-[#efd19c] sm:h-36 sm:w-36">
              <BookHeart
                size={62}
                strokeWidth={1.2}
              />
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[25px] border border-[#eae1d2] bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black text-[#af8850]">
                  تقدمك المحفوظ
                </p>

                <h2 className="mt-1 text-lg font-black">
                  الاستمرار على الذكر
                </h2>
              </div>

              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f7f0e3] text-[#aa8243]">
                <Heart size={20} />
              </span>
            </div>

            <div className="flex items-end justify-between gap-2">
              <p className="text-sm text-[#617575]">
                {arNumber(doneDaily)}
                {' '}من{' '}
                {arNumber(totalDaily)}
                {' '}ذكرًا مكتملًا
              </p>

              <span className="text-xl font-black text-[#a57b3c]">
                {arNumber(dailyPercent)}٪
              </span>
            </div>

            <div
              className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#eee8dd]"
              role="progressbar"
              aria-label="تقدم أورادك المحفوظة"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={dailyPercent}
            >
              <div
                className="h-full rounded-full bg-gradient-to-l from-[#c4a06a] to-[#1a6870] transition-all"
                style={{
                  width: `${dailyPercent}%`,
                }}
              />
            </div>

            <p className="mt-3 text-xs leading-6 text-[#82908f]">
              يعرض تقدم وردك على هذا الجهاز،
              مع تجديد أذكار الصباح والمساء
              كل يوم.
            </p>

            <Link
              href={`/adhkar/read?type=${lastDaily.id}&reciter=${reader.id}`}
              onClick={() =>
                markOpened(lastDaily.id)
              }
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#15555b] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#0c4147]"
            >
              <BookOpen size={18} />

              {lastDaily.done > 0 &&
              lastDaily.done < lastDaily.total
                ? 'استكمال الورد'
                : 'ابدأ قراءة الورد'}

              <ChevronLeft size={16} />
            </Link>
          </div>

          <div className="rounded-[25px] border border-[#eae1d2] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f6efe2] text-[#ac864f]">
                <Headphones size={22} />
              </span>

              <div>
                <h2 className="font-black">
                  اختر القارئ
                </h2>

                <p className="mt-0.5 text-xs text-[#899594]">
                  تسجيلات بشرية حقيقية
                </p>
              </div>
            </div>

            <div className="relative mt-4">
              <select
                value={readerId}
                onChange={changeReader}
                aria-label="اختر قارئ الأذكار"
                className="w-full appearance-none rounded-2xl border border-[#e4d8c6] bg-[#fdfbf7] py-3.5 pl-11 pr-4 text-sm font-extrabold text-[#194b4f] outline-none focus:border-[#b89a64] focus:ring-2 focus:ring-[#b89a64]/15"
              >
                {RECITERS.map((entry) => (
                  <option
                    key={entry.id}
                    value={entry.id}
                  >
                    {entry.name}
                  </option>
                ))}
              </select>

              <ChevronDown
                size={18}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#a8895e]"
              />
            </div>

            <p className="mt-3 text-xs leading-6 text-[#83908e]">
              تختلف التسجيلات حسب القارئ؛
              بعض التسجيلات لورد كامل
              ولا تقابل كل ذكر بشكل منفصل.
            </p>

            <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#967443]">
              <ShieldCheck size={14} />
              لا توجد قراءة صوتية اصطناعية
            </p>
          </div>
        </section>

        <section className="mt-9">
          <div className="mb-4 flex items-end justify-between gap-2">
            <div>
              <p className="text-xs font-black text-[#b18b51]">
                اليوم والليلة
              </p>

              <h2 className="mt-1 text-xl font-black">
                الأوراد الأساسية
              </h2>
            </div>

            <span className="rounded-full border border-[#e7d9c2] bg-white px-3 py-1.5 text-xs font-bold text-[#947648]">
              اختر وردك
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {daily.map((item) => {
              const Icon =
                item.icon === 'sun' ||
                item.icon === 'waking'
                  ? Sun
                  : Moon

              return (
                <Link
                  key={item.id}
                  href={`/adhkar/read?type=${item.id}&reciter=${reader.id}`}
                  onClick={() =>
                    markOpened(item.id)
                  }
                  className="group rounded-[23px] border border-[#e9e0d4] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#c8af84] hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f6efdf] text-[#a98147]">
                      <Icon size={24} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-black">
                        {item.title}
                      </span>

                      <span className="mt-1 block text-xs leading-6 text-[#7b8c8b]">
                        {item.description}
                      </span>
                    </span>

                    <ChevronLeft
                      className="mt-2 shrink-0 text-[#b2976b] transition-transform group-hover:-translate-x-1"
                      size={19}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 text-[11px] font-bold text-[#7d8b88]">
                    <span>
                      {arNumber(item.done)}
                      {' / '}
                      {arNumber(item.total)}
                      {' '}ذكر
                    </span>

                    <span>
                      {arNumber(item.percent)}٪
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#efe9e0]">
                    <div
                      className="h-full rounded-full bg-[#b89662]"
                      style={{
                        width: `${item.percent}%`,
                      }}
                    />
                  </div>

                  <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-[#a07a46]">
                    {item.recorded ? (
                      <>
                        <Volume2 size={14} />
                        تسجيل مُدرج للقارئ
                      </>
                    ) : (
                      <>
                        <BookOpen size={14} />
                        قراءة وعداد
                      </>
                    )}
                  </p>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="mt-9">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black text-[#b18b51]">
                حصن المسلم
              </p>

              <h2 className="mt-1 text-xl font-black">
                جميع الأذكار والأدعية
              </h2>

              <p className="mt-1 text-xs leading-6 text-[#82908d]">
                ابحث في العناوين ونصوص الأذكار،
                بالتشكيل أو بدونه.
              </p>
            </div>

            <span className="rounded-xl border border-[#e7d9c6] bg-white px-3 py-2 text-xs font-extrabold text-[#9a7848]">
              {arNumber(matches.length)}
              {' '}بابًا
            </span>
          </div>

          <div className="relative">
            <Search
              size={19}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#a58352]"
            />

            <input
              type="search"
              value={search}
              onChange={(
                event: ChangeEvent<HTMLInputElement>,
              ) =>
                setSearch(event.target.value)
              }
              aria-label="بحث في الأذكار"
              placeholder="مثلاً: السفر، النوم، الحمد لله…"
              className="w-full rounded-[18px] border border-[#e4d8c6] bg-white py-4 pl-12 pr-12 text-sm outline-none shadow-sm placeholder:text-[#a3aaa6] focus:border-[#b99961] focus:ring-2 focus:ring-[#b99961]/15"
            />

            {search && (
              <button
                type="button"
                onClick={() =>
                  setSearch('')
                }
                aria-label="مسح البحث"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[#8d9b98] hover:bg-[#f1e9dc]"
              >
                <X size={17} />
              </button>
            )}
          </div>

          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs font-bold text-[#6a807d]">
            <input
              type="checkbox"
              checked={audioOnly}
              onChange={(
                event: ChangeEvent<HTMLInputElement>,
              ) =>
                setAudioOnly(
                  event.target.checked,
                )
              }
              className="h-4 w-4 accent-[#ae8c57]"
            />

            الأبواب ذات تسجيلات للقارئ المختار
          </label>

          {status === 'loading' &&
          !categories.length ? (
            <div className="mt-5 flex min-h-44 flex-col items-center justify-center gap-3 rounded-[23px] border border-[#e8decd] bg-white text-[#92764a]">
              <Loader2
                size={28}
                className="animate-spin"
              />

              <p className="text-sm font-bold">
                جارٍ تجهيز مكتبة الأذكار…
              </p>
            </div>
          ) : status === 'error' &&
            !categories.length ? (
            <div className="mt-5 rounded-[23px] border border-[#e9d8b8] bg-white p-8 text-center">
              <CloudOff
                size={29}
                className="mx-auto text-[#af8951]"
              />

              <h3 className="mt-3 text-base font-black">
                تعذر فتح مكتبة الأذكار
              </h3>

              <p className="mt-2 text-xs leading-7 text-[#7f8b88]">
                افتح المكتبة مرة أثناء اتصال
                الإنترنت حتى يتم حفظ النصوص
                للاستخدام دون إنترنت.
              </p>

              <button
                type="button"
                onClick={retry}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#15565b] px-5 py-3 text-sm font-bold text-white"
              >
                <RefreshCw size={16} />
                إعادة المحاولة
              </button>
            </div>
          ) : matches.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {matches.map(
                ({
                  category,
                  matchingItem,
                  audioItems,
                }) => (
                  <Link
                    key={category.id}
                    href={`/adhkar/read?categoryId=${category.id}&reciter=${reader.id}`}
                    className="group flex items-center gap-3 rounded-[21px] border border-[#e9e0d5] bg-white p-4 shadow-sm transition hover:border-[#cab68f] hover:shadow-md"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f7f0e4] text-[#a98449]">
                      {categoryIcon(
                        category.category,
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black leading-6">
                        {category.category}
                      </span>

                      <span className="mt-1 block text-[11px] text-[#85908c]">
                        {arNumber(
                          category.array.length,
                        )}
                        {' '}ذكر ودعاء
                        {audioItems
                          ? ` · ${arNumber(
                              audioItems,
                            )} تسجيل فردي`
                          : ''}
                      </span>

                      {matchingItem && (
                        <span className="mt-2 block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-5 text-[#a18453]">
                          {matchingItem.text
                            .replace(/\s+/g, ' ')
                            .slice(0, 85)}
                          …
                        </span>
                      )}
                    </span>

                    <ChevronLeft
                      size={19}
                      className="shrink-0 text-[#b69a6b] transition-transform group-hover:-translate-x-1"
                    />
                  </Link>
                ),
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-[22px] border border-[#e9e0d4] bg-white p-8 text-center text-sm leading-7 text-[#7b8c88]">
              لا توجد نتائج مطابقة؛ جرّب
              عبارة أقصر أو ألغِ تصفية التسجيلات.
            </div>
          )}
        </section>

        <footer className="mt-9 space-y-2 rounded-[20px] border border-[#e9dfcf] bg-[#fffcf7] p-4 text-xs leading-7 text-[#7b8179]">
          <p className="flex items-start gap-2">
            <ShieldCheck
              size={17}
              className="mt-1 shrink-0 text-[#ae8c54]"
            />
            النصوص مأخوذة من بيانات
            «حصن المسلم»؛ لا تُنشأ الأذكار
            أو فضائلها بالذكاء الاصطناعي.
            وتُعرض المراجع التفصيلية عند
            توفرها في المصدر.
          </p>

          <p className="flex items-start gap-2">
            <Headphones
              size={17}
              className="mt-1 shrink-0 text-[#ae8c54]"
            />
            إدراج اسم القارئ لا يضمن
            استمرار توفر كل رابط خارجي.
            التسجيل الكامل لا يُحتسب
            تلقائيًا بدل العد اليدوي.
          </p>
        </footer>
      </div>
    </main>
  )
}
