
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  BookOpen,
  List,
  Heart,
  Book,
  Compass,
  ChevronLeft,
  Bell,
  Headphones,
  Clapperboard,
  LibraryBig,
  MessageCircle,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import AppDownloadsCard from '@/components/AppDownloadsCard'
import { APP_BUILD_ID } from '@/lib/app-version'
import { db } from '@/lib/firebase'
import { doc, getDoc, getDocFromCache } from 'firebase/firestore'

interface ReadingProgress {
  lastReadPage: number
  lastReadRiwayaId?: string
  lastReadSurahNumber?: number
  lastReadSurahName?: string
  lastReadJuz?: number
  lastReadAyahKey?: string
  lastReadReciterId?: string
  lastReadReciterName?: string
  lastReadMoshafId?: number
}

const READING_KEY = 'samee3_persistent_reading_v2'
const AUDIO_KEY = 'samee3_persistent_audio_v2'
const ACCOUNT_PROGRESS_PREFIX = 'samee3_home_account_progress_v1:'

const RIWAYAT = [
  'hafs',
  'warsh',
  'qalun',
  'douri',
  'shubah',
  'sousi',
  'bazzi',
]

type StoredObject = Record<string, unknown>

function asObject(value: unknown): StoredObject | null {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? (value as StoredObject)
    : null
}

function positiveInteger(
  value: unknown,
  max = Number.MAX_SAFE_INTEGER,
): number | undefined {
  if (
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    return undefined
  }

  if (typeof value === 'string' && !value.trim()) {
    return undefined
  }

  const number = Number(value)

  return Number.isSafeInteger(number) &&
    number >= 1 &&
    number <= max
    ? number
    : undefined
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}

function riwayaValue(value: unknown): string | undefined {
  return typeof value === 'string' && RIWAYAT.includes(value)
    ? value
    : undefined
}

function ayahKeyValue(value: unknown): string | undefined {
  if (
    typeof value !== 'string' ||
    !/^\d{1,3}:\d{1,3}$/.test(value)
  ) {
    return undefined
  }

  const [surah, ayah] = value.split(':')
  const surahNumber = positiveInteger(surah, 114)
  const ayahNumber = positiveInteger(ayah, 286)

  return surahNumber && ayahNumber
    ? `${surahNumber}:${ayahNumber}`
    : undefined
}

function readStoredObject(key: string): StoredObject | null {
  try {
    const value = window.localStorage.getItem(key)
    return value ? asObject(JSON.parse(value)) : null
  } catch {
    return null
  }
}

function normalizeAccountProgress(
  value: unknown,
): ReadingProgress | null {
  const data = asObject(value)
  if (!data) return null

  const page = positiveInteger(data.lastReadPage, 604)
  if (!page) return null

  const reciterId = positiveInteger(data.lastReadReciterId)

  return {
    lastReadPage: page,
    lastReadRiwayaId: riwayaValue(data.lastReadRiwayaId),
    lastReadSurahNumber: positiveInteger(
      data.lastReadSurahNumber,
      114,
    ),
    lastReadSurahName: textValue(data.lastReadSurahName),
    lastReadJuz: positiveInteger(data.lastReadJuz, 30),
    lastReadAyahKey: ayahKeyValue(data.lastReadAyahKey),
    lastReadReciterId: reciterId
      ? String(reciterId)
      : undefined,
    lastReadReciterName: textValue(data.lastReadReciterName),
    lastReadMoshafId: positiveInteger(data.lastReadMoshafId),
  }
}

function readDeviceProgress(): ReadingProgress | null {
  for (const key of [READING_KEY, AUDIO_KEY]) {
    const data = readStoredObject(key)
    if (!data) continue

    const page = positiveInteger(data.page, 604)
    if (!page) continue

    const surah = positiveInteger(data.surah, 114)
    const ayah = positiveInteger(data.ayah, 286)
    const reciterId = positiveInteger(data.reciterId)

    return {
      lastReadPage: page,
      lastReadRiwayaId: riwayaValue(data.riwaya),
      lastReadSurahNumber: surah,
      lastReadAyahKey: surah && ayah
        ? `${surah}:${ayah}`
        : undefined,
      lastReadReciterId: reciterId
        ? String(reciterId)
        : undefined,
      lastReadReciterName: textValue(data.reciterName),
      lastReadMoshafId: positiveInteger(data.moshafId),
    }
  }

  return null
}

function readAccountProgress(
  uid: string | undefined,
): ReadingProgress | null {
  return uid
    ? normalizeAccountProgress(
      readStoredObject(`${ACCOUNT_PROGRESS_PREFIX}${uid}`),
    )
    : null
}

function saveAccountProgress(
  uid: string,
  progress: ReadingProgress | null,
) {
  try {
    const key = `${ACCOUNT_PROGRESS_PREFIX}${uid}`

    if (progress) {
      window.localStorage.setItem(
        key,
        JSON.stringify(progress),
      )
    } else {
      window.localStorage.removeItem(key)
    }
  } catch {}
}

function buildContinueHref(
  progress: ReadingProgress | null,
): string {
  if (!progress) return '/mushaf'

  const params = new URLSearchParams({
    page: String(progress.lastReadPage),
  })

  if (progress.lastReadRiwayaId) {
    params.set('riwaya', progress.lastReadRiwayaId)
  }

  if (progress.lastReadReciterId) {
    params.set('reciterId', progress.lastReadReciterId)
  }

  if (progress.lastReadReciterName) {
    params.set('reciterName', progress.lastReadReciterName)
  }

  if (progress.lastReadMoshafId) {
    params.set(
      'moshafId',
      String(progress.lastReadMoshafId),
    )
  }

  if (progress.lastReadSurahNumber) {
    params.set(
      'surah',
      String(progress.lastReadSurahNumber),
    )
  }

  if (progress.lastReadAyahKey) {
    params.set('ayah', progress.lastReadAyahKey)
  }

  return `/mushaf?${params.toString()}`
}

export default function HomePage() {
  const { user, profile } = useAuth()
  const uid = user?.uid

  const [progress, setProgress] =
    useState<ReadingProgress | null>(null)

  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    let accountProgress = readAccountProgress(uid)

    const refreshLocalProgress = () => {
      if (cancelled) return
      setProgress(readDeviceProgress() ?? accountProgress)
    }

    const refreshAccountProgress = async () => {
      if (!uid || inFlight || cancelled) return
      inFlight = true

      try {
        const reference = doc(db, 'users', uid)

        const snapshot = navigator.onLine === false
          ? await getDocFromCache(reference)
          : await getDoc(reference)

        if (cancelled) return

        if (snapshot.exists()) {
          const next = normalizeAccountProgress(
            snapshot.data(),
          )

          if (next || !snapshot.metadata.fromCache) {
            accountProgress = next
            saveAccountProgress(uid, next)
          }
        } else if (!snapshot.metadata.fromCache) {
          accountProgress = null
          saveAccountProgress(uid, null)
        }

        refreshLocalProgress()
      } catch {
        refreshLocalProgress()
      } finally {
        inFlight = false
      }
    }

    const onConnectionChange = () => {
      setIsOffline(navigator.onLine === false)
      refreshLocalProgress()

      if (navigator.onLine !== false) {
        void refreshAccountProgress()
      }
    }

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === null ||
        event.key === READING_KEY ||
        event.key === AUDIO_KEY ||
        (
          uid &&
          event.key === `${ACCOUNT_PROGRESS_PREFIX}${uid}`
        )
      ) {
        accountProgress = readAccountProgress(uid)
        refreshLocalProgress()
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        onConnectionChange()
      }
    }

    setIsOffline(navigator.onLine === false)
    refreshLocalProgress()
    void refreshAccountProgress()

    window.addEventListener('online', onConnectionChange)
    window.addEventListener('offline', onConnectionChange)
    window.addEventListener('focus', onConnectionChange)
    window.addEventListener('pageshow', onConnectionChange)
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.removeEventListener('online', onConnectionChange)
      window.removeEventListener('offline', onConnectionChange)
      window.removeEventListener('focus', onConnectionChange)
      window.removeEventListener('pageshow', onConnectionChange)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener(
        'visibilitychange',
        onVisible,
      )
    }
  }, [uid])

  const displayName =
    profile?.name?.trim() ||
    user?.displayName?.trim() ||
    'يا باغي الخير'

  const lastPage = progress?.lastReadPage ?? 1
  const hasReadingProgress = progress !== null
  const continueHref = buildContinueHref(progress)

  return (
    <div className="min-h-screen bg-[var(--bg-main)] px-4 pb-32 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-7 flex items-center justify-between gap-4 pt-1">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src={`/icon-192.png?v=${encodeURIComponent(APP_BUILD_ID)}`}
              alt="شعار مصحف سميع"
              width={58}
              height={58}
              priority
              className="h-14 w-14 shrink-0 rounded-2xl border border-[#d8bd88] shadow-sm"
            />

            <div className="min-w-0">
              <p className="mb-1 text-sm font-medium text-slate-500">
                السلام عليكم،
              </p>

              <h1 className="truncate text-2xl font-extrabold tracking-tight text-[var(--text-main)]">
                {displayName}
              </h1>

              <p className="mt-1 text-xs font-medium text-slate-400">
                أهلاً بك في مصحف سميع
              </p>
            </div>
          </div>

          <Link
            href="/notifications"
            aria-label="فتح إعدادات الإشعارات والتذكيرات"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d9c8a8] bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#b99863] hover:shadow-md active:scale-95"
          >
            <Bell
              size={22}
              strokeWidth={2}
              className="text-[var(--royal-blue)]"
            />
          </Link>
        </header>

        {isOffline && (
          <div
            role="status"
            className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-900"
          >
            أنت دون اتصال بالإنترنت. يمكنك قراءة الصفحات
            وتشغيل الصوتيات التي سبق حفظها على هذا الجهاز.
          </div>
        )}

        <section className="relative mb-8 overflow-hidden">
          <div className="relative overflow-hidden rounded-[30px] border border-[#c6aa72]/60 bg-gradient-to-br from-[#255348] via-[#1d473f] to-[#152f2b] p-5 text-white shadow-[0_12px_35px_rgba(20,57,47,0.18)] sm:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-white/10 blur-2xl"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-amber-200/10 blur-3xl"
            />

            <div className="relative z-10">
              <div className="mb-5 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                  <BookOpen size={18} />
                </span>

                <span className="text-sm font-bold text-white/90">
                  متابعة القراءة
                </span>
              </div>

              <div className="mb-5">
                <h2 className="mb-2 font-uthmani text-3xl leading-relaxed sm:text-4xl">
                  {hasReadingProgress
                    ? 'استكمال الورد'
                    : 'ابدأ تلاوتك'}
                </h2>

                {hasReadingProgress ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                      الصفحة {lastPage}
                    </span>

                    {progress?.lastReadSurahName && (
                      <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                        سورة {progress.lastReadSurahName}
                      </span>
                    )}

                    {typeof progress?.lastReadJuz === 'number' && (
                      <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                        الجزء {progress.lastReadJuz}
                      </span>
                    )}

                    {progress?.lastReadReciterName && (
                      <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
                        {progress.lastReadReciterName}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm font-medium leading-7 text-white/85">
                    ابدأ رحلتك مع القرآن الكريم واختر السورة
                    والرواية والقارئ المناسب لك.
                  </p>
                )}
              </div>

              <Link
                href={continueHref}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 font-bold text-[var(--royal-blue)] shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-50 active:scale-[0.99]"
              >
                {hasReadingProgress
                  ? 'أكمل التلاوة'
                  : 'فتح المصحف'}

                <ChevronLeft
                  size={20}
                  strokeWidth={2.5}
                />
              </Link>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-[var(--text-main)]">
                الخدمات السريعة
              </h2>

              <p className="mt-1 text-xs font-medium text-slate-400">
                كل ما تحتاجه في مكان واحد
              </p>
            </div>

            <Link
              href="/surahs"
              className="text-xs font-bold text-[var(--royal-blue)] transition-colors hover:text-[#6a4b20]"
            >
              فتح الفهرس
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <QuickServiceCard
              href="/surahs"
              icon={List}
              title="فهرس السور"
              description="السور والقراءات"
            />

            <QuickServiceCard
              href="/visual-ayahs"
              icon={Clapperboard}
              title="آيات مرئية"
              description="صمّم فيديو للآيات"
            />

            <QuickServiceCard
              href="/audio"
              icon={Headphones}
              title="المكتبة الصوتية"
              description="استمع للقرآن"
            />

            <QuickServiceCard
              href="/prayer"
              icon={Compass}
              title="مواقيت الصلاة"
              description="أوقات الصلاة"
            />

            <QuickServiceCard
              href="/hadith"
              icon={Book}
              title="الأحاديث النبوية"
              description="كتب الحديث"
            />

            <QuickServiceCard
              href="/adhkar"
              icon={Heart}
              title="الأذكار والتسبيح"
              description="أذكار المسلم"
            />

            <QuickServiceCard
              href="/islamic-library"
              icon={LibraryBig}
              title="المكتبة الشرعية"
              description="كتب ومراجع"
            />

            <QuickServiceCard
              href="/tarbiyah-iman"
              icon={GraduationCap}
              title="التربية الإيمانية للأبناء"
              description="دروس مرئية ومادة علمية"
            />

            <QuickServiceCard
              href="/messages"
              icon={MessageCircle}
              title="تواصل مع الإدارة"
              description="رسائل نصية فقط"
            />
          </div>
        </section>
        <AppDownloadsCard />
      </div>
    </div>
  )
}

interface QuickServiceCardProps {
  href: string
  icon: LucideIcon
  title: string
  description: string
}

function QuickServiceCard({
  href,
  icon: Icon,
  title,
  description,
}: QuickServiceCardProps) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-[22px] border border-[var(--border-light)] bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[rgba(14,165,233,0.35)] hover:shadow-md active:scale-[0.98]"
    >
      <div className="flex flex-col items-center text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(2,132,199,0.08)] transition-all duration-200 group-hover:scale-105 group-hover:bg-[rgba(2,132,199,0.13)]">
          <Icon
            size={24}
            strokeWidth={2}
            className="text-[var(--royal-blue)]"
          />
        </span>

        <span className="text-sm font-extrabold text-[var(--text-main)]">
          {title}
        </span>

        <span className="mt-1 text-[10px] font-medium text-slate-400">
          {description}
        </span>
      </div>
    </Link>
  )
}
