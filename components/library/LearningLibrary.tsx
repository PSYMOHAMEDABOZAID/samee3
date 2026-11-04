'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  Download,
  ExternalLink,
  GraduationCap,
  Headphones,
  Loader2,
  PlayCircle,
  Search,
  Share2,
  X,
} from 'lucide-react'
import { SUNNI_LIBRARY_CATEGORIES } from '@/lib/islamic/sunniLibrary'
import {
  LEARNING_LEVELS,
  completedInLevel,
  coursesInLevel,
  normalizeLearningName,
  type LevelId,
} from '@/lib/islamic/curriculum'
import { useLearningProgress, type LearningCertificate } from '@/lib/islamic/learning-progress'
import Modal from '@/components/Modal'
import ManagedBookStudyView from './ManagedBookStudyView'
import ManagedCategoryView from './ManagedCategoryView'
import { useManagedCatalog } from '@/lib/islamic/use-managed-library'
import { publicLibraryBooks } from '@/lib/islamic/managed-library'
import { cardBlob, downloadBlob, wrapCardText } from '@/lib/share-card'

const ar = (n: number) => n.toLocaleString('ar-EG')
const button =
  'inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d9ccb5] bg-white px-4 py-3 text-sm font-bold transition hover:border-[#a47a3e] disabled:opacity-50'
function Shell({
  back,
  backLabel,
  eyebrow,
  title,
  children,
}: {
  back: string
  backLabel: string
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <div dir="rtl" className="min-h-screen bg-[#f7f5ee] pb-28 text-[#203f43]">
      <div className="h-1 bg-gradient-to-l from-[#98713c] via-[#d9c39b] to-[#175759]" />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-7 sm:py-10">
        <Link href={back} className="mb-7 inline-flex items-center gap-2 text-sm text-[#687b79]">
          <ArrowRight size={17} />
          {backLabel}
        </Link>
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-bold tracking-wide text-[#a47a3e]">{eyebrow}</p>
            <h1 className="text-3xl font-black sm:text-4xl">{title}</h1>
          </div>
          <GraduationCap className="shrink-0 text-[#ad8b54]" size={38} />
        </header>
        {children}
      </main>
    </div>
  )
}
function Progress({
  count,
  total,
  title = 'تقدمك في المستوى',
}: {
  count: number
  total: number
  title?: string
}) {
  const percent = total ? Math.round((count / total) * 100) : 0
  return (
    <div>
      <div className="mb-2 flex justify-between gap-4 text-xs">
        <span>{title}</span>
        <span>
          {ar(count)} من {ar(total)} · {ar(percent)}٪
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={count}
        className="h-2 overflow-hidden rounded-full bg-[#dedbd0]"
      >
        <div
          className="h-full rounded-full bg-gradient-to-l from-[#b08a4e] to-[#20706a] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
function Status({ progress }: { progress: ReturnType<typeof useLearningProgress> }) {
  return (
    <div className="my-5 text-xs leading-7 text-[#78857f]">
      {!progress.ready ? (
        'جارٍ استعادة تقدمك…'
      ) : !progress.user ? (
        <>
          تقدمك محفوظ على هذا الجهاز.{' '}
          <Link href="/auth?next=/islamic-library" className="font-bold text-[#8e6935] underline">
            سجّل الدخول
          </Link>{' '}
          لحفظه في حسابك وإصدار شهادتك.
        </>
      ) : progress.pending ? (
        'توجد تغييرات محفوظة على الجهاز تنتظر المزامنة.'
      ) : (
        'تقدمك مرتبط بحسابك.'
      )}
      {progress.user && progress.guestAvailable && (
        <button
          type="button"
          disabled={progress.busy}
          onClick={() => void progress.importGuest()}
          className="mr-3 font-bold text-[#8e6935] underline"
        >
          استيراد تقدم هذا الجهاز إلى حسابي
        </button>
      )}
      {progress.error && (
        <p role="status" className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
          {progress.error}
        </p>
      )}
    </div>
  )
}

export function LibraryHome() {
  const progress = useLearningProgress(),
    catalog = useManagedCatalog()
  return (
    <Shell back="/" backLabel="الرئيسية" eyebrow="مكتبة سميع الشرعية" title="رحلتك في طلب العلم">
      <p className="mb-8 max-w-xl text-sm leading-8 text-[#6c7d77]">
        ثلاثة مستويات، وثمانية مجالات في كل مستوى. اقرأ الكتاب، تابع الشرح، وسجّل إتمام دراسته لتتابع رحلتك
        وتحصل على شهادة إتمام ذاتي باسمك.
      </p>
      <div className="grid gap-5 md:grid-cols-3">
        {LEARNING_LEVELS.map((level) => {
          const books = coursesInLevel(level.id),
            count = completedInLevel(level.id, progress.completed)
          return (
            <Link
              key={level.id}
              href={`/islamic-library/level/${level.id}`}
              className="group relative overflow-hidden rounded-[28px] border border-[#dfd5c3] bg-[#fffefa] p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg sm:p-7"
            >
              <span className="absolute left-5 top-1 font-serif text-8xl text-[#eee8d9]">{level.number}</span>
              <div className="relative mb-14 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0e6d5] text-[#a47a3e]">
                <BookOpen size={25} />
              </div>
              <div className="relative">
                <p className="mb-2 text-xs text-[#9d8052]">
                  ثمانية مجالات ·{' '}
                  {ar(publicLibraryBooks(catalog.books).filter((book) => book.levelId === level.id).length)} كتاب
                </p>
                <h2 className="mb-3 text-2xl font-black">{level.name}</h2>
                <p className="mb-6 min-h-12 text-sm leading-7 text-[#76827b]">{level.description}</p>
                <Progress count={count} total={books.length} />
                <span className="mt-6 flex items-center justify-between text-sm font-bold">
                  {count > 0 ? 'تابع رحلتك' : 'اكتشف المستوى'}
                  {progress.certificates[level.id] ? (
                    <Award size={20} className="text-[#ad8444]" />
                  ) : (
                    <ChevronLeft size={20} />
                  )}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
      <Status progress={progress} />
    </Shell>
  )
}

export function LevelView({ levelId }: { levelId: LevelId }) {
  const catalog = useManagedCatalog()
  const progress = useLearningProgress(),
    level = LEARNING_LEVELS.find((item) => item.id === levelId)!
  const [certificateOpen, setCertificateOpen] = useState(false)
  const books = coursesInLevel(levelId),
    count = completedInLevel(levelId, progress.completed)
  return (
    <Shell
      back="/islamic-library"
      backLabel="المستويات الثلاثة"
      eyebrow="اختر المجال، ثم اختر كتابك"
      title={level.name}
    >
      <section className="mb-7 rounded-3xl border border-[#cfc3a8] bg-[#163f43] p-5 text-[#f8f3e8] sm:p-7">
        <div className="grid items-center gap-5 sm:grid-cols-[1fr_auto]">
          <div>
            <h2 className="mb-4 font-bold">خطوة جديدة في كل كتاب</h2>
            <Progress count={count} total={books.length} />
          </div>
          <button
            type="button"
            disabled={!progress.ready || (!progress.certificates[levelId] && count !== books.length)}
            onClick={() => setCertificateOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#bca16e] px-5 py-3 text-sm font-bold disabled:opacity-40"
          >
            <Award size={21} />
            {progress.certificates[levelId] ? 'شهادتك المحفوظة' : 'شهادة المستوى'}
          </button>
        </div>
        <p className="mt-3 text-xs leading-6 text-[#b5cbc6]">
          تُتاح شهادة الإتمام الذاتي بعد دراسة كتب المستوى الثمانية. إصدار واحد لكل حساب ومستوى، مع الاحتفاظ
          بالشهادة نفسها.
        </p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SUNNI_LIBRARY_CATEGORIES.map((category, i) => {
          const visible = publicLibraryBooks(catalog.books).filter(
            (book) => !book.deleted && book.levelId === levelId && book.category === category.id,
          )
          const related = books.filter((book) => book.category === category.id),
            done = related.filter((book) => progress.completed.includes(book.id)).length
          return (
            <Link
              key={category.id}
              href={`/islamic-library/level/${levelId}/${category.id}`}
              className="rounded-3xl border border-[#e0d8c7] bg-white p-5 transition hover:border-[#ac894f]"
            >
              <div className="mb-5 flex justify-between">
                <span className="text-xs text-[#a68d61]">{ar(i + 1).padStart(2, '٠')}</span>
                {done === related.length && done > 0 ? (
                  <CheckCircle2 size={23} className="text-[#2b7863]" />
                ) : (
                  <BookOpen size={23} className="text-[#b39763]" />
                )}
              </div>
              <h2 className="text-lg font-black">{category.label}</h2>
              <p className="mb-5 mt-2 text-xs text-[#7d8981]">
                {category.short} · {ar(visible.length)} كتاب
              </p>
              <Progress count={done} total={related.length} title="الكتب المكتملة" />
            </Link>
          )
        })}
      </div>
      <Status progress={progress} />
      {certificateOpen && (
        <CertificateDialog
          levelId={levelId}
          existing={progress.certificates[levelId]}
          defaultName={progress.profile?.name || progress.user?.displayName || ''}
          signedIn={!!progress.user}
          issue={progress.issue}
          onClose={() => setCertificateOpen(false)}
        />
      )}
    </Shell>
  )
}

export function CategoryView({ levelId, categoryId }: { levelId: LevelId; categoryId: string }) {
  return <ManagedCategoryView levelId={levelId} categoryId={categoryId} />
}

export function BookStudyView({ bookId }: { bookId: string }) {
  return <ManagedBookStudyView bookId={bookId} />
}

function certificateCanvas(certificate: LearningCertificate, title: string): Promise<HTMLCanvasElement> {
  return Promise.all([
    document.fonts.load('bold 86px "Amiri"'),
    document.fonts.load('bold 28px "Tajawal"'),
    document.fonts.load('32px "Tajawal"'),
  ]).then(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1800
    canvas.height = 1273
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('تعذر رسم الشهادة.')
    ctx.fillStyle = '#fffdf5'
    ctx.fillRect(0, 0, 1800, 1273)
    ctx.fillStyle = '#16494b'
    ctx.fillRect(0, 0, 35, 1273)
    ctx.fillRect(1765, 0, 35, 1273)
    ctx.strokeStyle = '#b28a49'
    ctx.lineWidth = 3
    ctx.strokeRect(65, 65, 1670, 1143)
    ctx.lineWidth = 1
    ctx.strokeRect(81, 81, 1638, 1111)
    for (const [x, y] of [
      [95, 95],
      [1705, 95],
      [95, 1178],
      [1705, 1178],
    ]) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = '#b28a49'
      ctx.fillRect(-12, -12, 24, 24)
      ctx.restore()
    }
    ctx.direction = 'rtl'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#a47a3e'
    ctx.font = 'bold 28px "Tajawal",sans-serif'
    ctx.fillText('مُصْحَف سَمِيع  |  المكتبة الشرعية', 900, 190)
    ctx.fillStyle = '#17494b'
    ctx.font = 'bold 86px "Amiri",serif'
    ctx.fillText('شهادة إتمام دراسة ذاتية', 900, 330)
    ctx.font = '32px "Tajawal",sans-serif'
    ctx.fillStyle = '#7c8072'
    ctx.fillText('تُمنح هذه الشهادة إلى', 900, 430)
    ctx.fillStyle = '#a17a40'
    let nameSize = 70
    let lines: string[] = []
    do {
      ctx.font = `bold ${nameSize}px "Amiri",serif`
      lines = wrapCardText(ctx, certificate.name, 1420)
      nameSize -= 2
    } while (lines.length > 2 && nameSize > 34)
    lines.forEach((line, i) => ctx.fillText(line, 900, 550 + i * 80))
    const shift = (lines.length - 1) * 60
    ctx.fillStyle = '#244d4c'
    ctx.font = '34px "Tajawal",sans-serif'
    ctx.fillText(`لإتمام متابعة كتب ${title} في مكتبة سميع الشرعية`, 900, 695 + shift)
    ctx.font = '29px "Tajawal",sans-serif'
    ctx.fillStyle = '#7a8176'
    ctx.fillText('العقيدة • الفقه • السيرة • أصول التفسير', 900, 780 + shift)
    ctx.fillText('أصول الفقه • أصول الحديث • التفسير • كتب السنة', 900, 830 + shift)
    ctx.strokeStyle = '#c4aa75'
    ctx.beginPath()
    ctx.moveTo(400, 930 + shift)
    ctx.lineTo(1400, 930 + shift)
    ctx.stroke()
    ctx.font = '25px "Tajawal",sans-serif'
    ctx.fillStyle = '#64776f'
    ctx.fillText(
      `تاريخ الإصدار: ${certificate.issuedAt?.toDate?.().toISOString().slice(0, 10) || certificate.issuedDate || ''}     •     ثمانية كتب`,
      900,
      1000 + shift,
    )
    ctx.direction = 'ltr'
    ctx.font = '23px sans-serif'
    ctx.fillText(certificate.serial, 900, 1060 + shift)
    ctx.direction = 'rtl'
    ctx.font = '20px "Tajawal",sans-serif'
    ctx.fillText('شهادة متابعة ذاتية وفق سجل صاحب الحساب، وليست اعتمادًا أو إجازة علمية.', 900, 1150)
    return canvas
  })
}
function CertificateDialog({
  levelId,
  existing,
  defaultName,
  signedIn,
  issue,
  onClose,
}: {
  levelId: LevelId
  existing?: LearningCertificate
  defaultName: string
  signedIn: boolean
  issue: (level: LevelId, name: string) => Promise<LearningCertificate>
  onClose: () => void
}) {
  const [name, setName] = useState(defaultName),
    [certificate, setCertificate] = useState(existing),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [preview, setPreview] = useState('')
  const title = LEARNING_LEVELS.find((item) => item.id === levelId)!.name
  useEffect(() => {
    if (existing) setCertificate(existing)
  }, [existing])
  useEffect(() => {
    let alive = true,
      url = ''
    if (certificate)
      void certificateCanvas(certificate, title)
        .then(cardBlob)
        .then((blob) => {
          if (alive) {
            url = URL.createObjectURL(blob)
            setPreview(url)
          }
        })
        .catch(() => {
          if (alive) setError('تعذرت معاينة الشهادة.')
        })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [certificate, title])
  const create = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      setCertificate(await issue(levelId, name))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إصدار الشهادة.')
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    if (!certificate) return
    setBusy(true)
    try {
      downloadBlob(await cardBlob(await certificateCanvas(certificate, title)), `${certificate.serial}.png`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر حفظ الشهادة.')
    } finally {
      setBusy(false)
    }
  }
  const print = () => {
    if (!preview) return
    const page = window.open('', '_blank')
    if (!page) {
      setError('اسمح بفتح نافذة الطباعة لهذا الموقع.')
      return
    }
    // Only a generated local blob URL is inserted; names are already drawn on the canvas.
    page.document.write(
      `<!doctype html><html lang="ar"><head><title>شهادة سميع</title><style>@page{size:A4 landscape;margin:0}body{margin:0;background:white}img{width:100%;height:100vh;object-fit:contain}@media print{img{height:209mm;width:296mm}}</style></head><body><img alt="شهادة سميع" src="${preview}"></body></html>`,
    )
    page.document.close()
    const image = page.document.querySelector('img')
    const ready = () => {
      page.focus()
      page.print()
    }
    if (image) {
      if (image.complete) ready()
      else image.onload = ready
    }
  }
  return (
    <Modal
      title="شهادة إتمام المستوى"
      onClose={() => {
        if (!busy) onClose()
      }}
      wide
    >
      <div className="mb-5 flex justify-between">
        <h2 className="flex items-center gap-2 text-lg font-black">
          <Award className="text-[#b18b4f]" />
          شهادة {title}
        </h2>
        <button type="button" aria-label="إغلاق" disabled={busy} onClick={onClose}>
          <X />
        </button>
      </div>
      {!signedIn ? (
        <div className="rounded-2xl bg-white p-6 text-sm leading-8">
          سجّل الدخول ليُحفظ إصدار الشهادة في حسابك.
          <Link className={`${button} mt-4`} href={`/auth?next=/islamic-library/level/${levelId}`}>
            تسجيل الدخول
          </Link>
        </div>
      ) : certificate ? (
        <>
          <p className="mb-4 text-xs text-[#7d826e]">
            صدرت هذه الشهادة باسم ثابت. يمكنك حفظ نسختها الأصلية مرة أخرى.
          </p>
          {preview ? (
            <img
              src={preview}
              alt={`شهادة ${certificate.name}`}
              className="w-full rounded-xl border border-[#dcc9a4]"
            />
          ) : (
            <Loader2 className="mx-auto my-10 animate-spin" />
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy || !preview} onClick={() => void save()}>
              <Download size={18} />
              حفظ صورة الشهادة
            </button>
            <button type="button" className={button} disabled={!preview} onClick={print}>
              طباعة / حفظ PDF
            </button>
          </div>
        </>
      ) : (
        <div className="mx-auto max-w-lg space-y-4 rounded-2xl bg-white p-6">
          <p className="text-sm leading-8">
            أتممت كتب المستوى. اكتب الاسم كما تريد ظهوره؛ لا يمكن تغييره أو إصدار شهادة ثانية لهذا المستوى.
          </p>
          <label className="block text-sm font-bold">
            الاسم في الشهادة
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              autoComplete="name"
              className="mt-2 w-full rounded-xl border border-[#cdbb99] p-3"
            />
          </label>
          <button
            type="button"
            disabled={busy || normalizeLearningName(name).length < 2}
            onClick={() => void create()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1d5555] p-4 font-bold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 size={19} className="animate-spin" /> : <Award size={19} />}إصدار الشهادة بهذا
            الاسم
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </Modal>
  )
}
