'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
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
  Share2,
  X,
} from 'lucide-react'
import { courseById, completedInLevel, coursesInLevel, LEARNING_LEVELS } from '@/lib/islamic/curriculum'
import { SUNNI_LIBRARY_CATEGORIES } from '@/lib/islamic/sunniLibrary'
import { useLearningProgress } from '@/lib/islamic/learning-progress'
import { safeIslamicLibraryLink } from '@/lib/islamic/safeLinks'
import { useManagedBook } from '@/lib/islamic/use-managed-library'
import { studySources } from '@/lib/islamic/managed-library'
import Modal from '@/components/Modal'
import CourseStudyStudio from './CourseStudyStudio'

const button =
  'inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d9ccb5] bg-white px-4 py-3 text-sm font-bold transition hover:border-[#a47a3e] disabled:opacity-50'
export default function ManagedBookStudyView({ bookId }: { bookId: string }) {
  const { book, ready, lessonsReady, error } = useManagedBook(bookId),
    progress = useLearningProgress()
  const [mode, setMode] = useState<'video' | 'audio' | null>(null),
    [notice, setNotice] = useState('')
  useEffect(() => {
    if (book?.deleted) setMode(null)
  }, [book?.deleted])
  const resource = (url: string | undefined, label: string, icon: ReactNode) => {
    const safe = safeIslamicLibraryLink(url)
    return safe ? (
      <a className={button} href={safe} target="_blank" rel="noopener noreferrer">
        {icon}
        {label}
        <ExternalLink size={14} />
      </a>
    ) : null
  }
  if (!ready || (!lessonsReady && !error))
    return (
      <main
        dir="rtl"
        className="flex min-h-[60dvh] items-center justify-center gap-2 bg-[#f7f5ee] text-[#203f43]"
      >
        <Loader2 className="animate-spin" size={20} />
        جارٍ تحميل الكتاب…
      </main>
    )
  if (!book || book.deleted)
    return (
      <main dir="rtl" className="min-h-[60dvh] bg-[#f7f5ee] p-8 text-center text-[#203f43]">
        <h1 className="text-xl font-black">هذا الكتاب غير متاح حاليًا</h1>
        {error && (
          <p role="alert" className="my-4 text-sm">
            {error}
          </p>
        )}
        <Link href="/islamic-library" className={`${button} mt-6`}>
          العودة إلى المكتبة
        </Link>
      </main>
    )
  const category = SUNNI_LIBRARY_CATEGORIES.find((item) => item.id === book.category)!,
    level = LEARNING_LEVELS.find((item) => item.id === book.levelId)!
  const course = courseById(book.id),
    completed = progress.completed.includes(book.id),
    hasVideo = studySources(book).length > 0
  const share = async () => {
    const url = `${location.origin}/islamic-library/book/${book.id}`
    try {
      if (navigator.share) await navigator.share({ title: book.title, url })
      else {
        await navigator.clipboard.writeText(url)
        setNotice('تم نسخ رابط الكتاب.')
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setNotice('تعذرت المشاركة. يمكنك نسخ الرابط من شريط العنوان.')
    }
  }
  return (
    <div dir="rtl" className="min-h-screen bg-[#f7f5ee] pb-28 text-[#203f43]">
      <div className="h-1 bg-gradient-to-l from-[#98713c] via-[#d9c39b] to-[#175759]" />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-7 sm:py-10">
        <Link
          href={`/islamic-library/level/${book.levelId}/${book.category}`}
          className="mb-7 inline-flex items-center gap-2 text-sm text-[#687b79]"
        >
          <ArrowRight size={17} />
          {category.label}
        </Link>
        <header className="mb-8">
          <p className="mb-2 text-xs font-bold text-[#a47a3e]">
            {level.name} / {category.label}
          </p>
          <h1 className="text-3xl font-black sm:text-4xl">{book.title}</h1>
        </header>
        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm">
            {error}
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div>
            <section className="rounded-3xl border border-[#ded3bd] bg-white p-6 sm:p-8">
              <p className="mb-4 text-sm font-bold text-[#a17b43]">تأليف {book.author}</p>
              <p className="text-sm leading-8 text-[#6a7c77]">{book.description}</p>
              {book.videoAuthor && (
                <p className="mt-4 text-sm font-bold text-[#a17b43]">الشرح المرئي: {book.videoAuthor}</p>
              )}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <Link className={button} href={`/islamic-library/book/${book.id}/read`}>
                  <BookOpen size={20} />
                  {book.readingLabel || 'قراءة الكتاب'}
                </Link>
                {hasVideo || book.downloadUrl || book.pdfParts?.length ? (
                  <button
                    className={`${button} !bg-[#1c5152] !text-white`}
                    type="button"
                    onClick={() => setMode('video')}
                  >
                    <PlayCircle size={20} />
                    {hasVideo ? 'تشغيل الشرح والكتاب PDF' : 'قراءة الكتاب PDF'}
                  </button>
                ) : null}
                {resource(
                  book.downloadUrl || book.readingUrl,
                  book.downloadUrl ? 'تحميل الكتاب PDF' : 'قراءة الكتاب من المصدر',
                  <Download size={20} />,
                )}
                {(book.audioUrl || book.audioSourceUrl) && (
                  <button type="button" className={button} onClick={() => setMode('audio')}>
                    <Headphones size={20} />
                    الشرح الصوتي
                  </button>
                )}
                <button type="button" className={button} onClick={() => void share()}>
                  <Share2 size={19} />
                  مشاركة رابط الكتاب
                </button>
              </div>
              {notice && (
                <p role="status" className="mt-3 text-xs text-[#718079]">
                  {notice}
                </p>
              )}
            </section>
            <section className="mt-5 rounded-3xl border border-[#dfd7c7] bg-[#fffefa] p-6">
              <h2 className="mb-3 font-black">الكتاب والشرح</h2>
              {book.sharhTitle && (
                <p className="mb-3 text-sm font-bold">
                  {book.sharhTitle}
                  {book.sharhAuthor ? ` — ${book.sharhAuthor}` : ''}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {resource(book.sharhUrl, book.sharhLabel || 'قراءة الشرح', <BookOpen size={17} />)}
                {resource(book.videoUrl, 'فتح الشرح من المصدر', <PlayCircle size={17} />)}
                {resource(book.audioSourceUrl, 'مصدر الصوت', <Headphones size={17} />)}
                {resource(book.videoDownloadUrl, 'تحميل الفيديو من الناشر', <Download size={17} />)}
              </div>
              {book.resourceNote && (
                <p className="mt-4 rounded-xl bg-[#f2ecdf] p-3 text-xs leading-7">{book.resourceNote}</p>
              )}
            </section>
          </div>
          <aside>
            <section className="rounded-3xl bg-[#163f43] p-6 text-[#f6f0e1]">
              <GraduationCap className="mb-5 text-[#d3b77d]" size={32} />
              <h2 className="font-black">دراستك لهذا الكتاب</h2>
              {course ? (
                <>
                  <p className="my-4 text-xs leading-7 text-[#bacbc6]">
                    سجّل الإتمام بعد دراسة الكتاب وشرحه. الشهادة توثق المتابعة الذاتية.
                  </p>
                  <button
                    type="button"
                    disabled={!progress.ready || progress.busy}
                    onClick={() => void progress.toggle(book.id)}
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl px-3 py-3.5 text-sm font-bold disabled:opacity-50 ${completed ? 'bg-[#e8d8b4] text-[#294b45]' : 'bg-white text-[#214b4a]'}`}
                  >
                    {progress.busy ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : completed ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Check size={18} />
                    )}{' '}
                    {completed ? 'أتممت الدراسة · تراجع' : 'أتممت دراسة الكتاب'}
                  </button>
                  <p className="mt-6 text-xs text-[#d9c28f]">
                    أكملت {completedInLevel(course.levelId, progress.completed)} من{' '}
                    {coursesInLevel(course.levelId).length} كتب منهج الشهادة.
                  </p>
                </>
              ) : (
                <p className="my-4 text-xs leading-7 text-[#bacbc6]">
                  هذا الكتاب متاح للدراسة والقراءة ضمن المكتبة، وهو خارج كتب منهج الشهادة.
                </p>
              )}
              <Link
                href={`/islamic-library/level/${book.levelId}`}
                className="mt-5 inline-flex items-center gap-2 text-xs text-[#d9c28f]"
              >
                العودة إلى المستوى
                <ChevronLeft size={16} />
              </Link>
              {progress.error && (
                <p role="alert" className="mt-3 text-xs">
                  {progress.error}
                </p>
              )}
            </section>
          </aside>
        </div>
        {mode && (
          <Modal
            title={mode === 'video' ? 'شرح الكتاب' : 'الشرح الصوتي'}
            onClose={() => setMode(null)}
            wide
            fullHeight={mode === 'video'}
          >
            <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
              <h2 className="font-black">{book.title}</h2>
              <button type="button" aria-label="إغلاق الشرح" onClick={() => setMode(null)}>
                <X />
              </button>
            </div>
            {mode === 'video' ? (
              <CourseStudyStudio key={book.id} book={book} />
            ) : (
              <div className="space-y-4">
                {book.audioUrl && (
                  <audio
                    key={book.audioUrl}
                    controls
                    preload="none"
                    src={safeIslamicLibraryLink(book.audioUrl) || undefined}
                    className="w-full"
                  />
                )}
                {resource(
                  book.audioSourceUrl || book.audioUrl,
                  'مصدر الشرح الصوتي',
                  <Headphones size={20} />,
                )}
              </div>
            )}
          </Modal>
        )}
      </main>
    </div>
  )
}
