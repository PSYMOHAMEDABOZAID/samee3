'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDocsFromServer,
  runTransaction,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import {
  BookOpen,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Save,
  Search,
  Settings2,
  Video,
  X,
} from 'lucide-react'
import { db } from '@/lib/firebase'
import { SUNNI_LIBRARY_CATEGORIES, SUNNI_LIBRARY_LEVELS } from '@/lib/islamic/sunniLibrary'
import { safeIslamicLibraryLink } from '@/lib/islamic/safeLinks'
import { youtubeSource } from '@/lib/islamic/youtube-player'
import {
  BOOK_LINK_FIELDS,
  BOOK_TEXT_FIELDS,
  effectivePolicy,
  mergeLibraryBook,
  mergeLibraryCatalog,
  playlistOverride,
  playlistPolicyKey,
  studySources,
  publicLibraryBooks,
  type ManagedBook,
  type ManagedLesson,
  type PlaylistOverride,
} from '@/lib/islamic/managed-library'
import { useManagedBook, useManagedCatalog } from '@/lib/islamic/use-managed-library'
import CurrentExplanationEditor, { type CurrentLessonEdit } from './CurrentExplanationEditor'

type Choice = 'inherit' | 'allow' | 'block'
type Draft = Record<(typeof BOOK_TEXT_FIELDS)[number] | (typeof BOOK_LINK_FIELDS)[number], string> & {
  category: ManagedBook['category']
  level: ManagedBook['level']
  deleted: boolean
  lessonSeekDefault: boolean
  lessonSpeedDefault: boolean
  quranpediaBookId: string
  pdfParts: { label: string; url: string }[]
}
type LessonDraft = {
  title: string
  url: string
  order: string
  seeking: Choice
  speed: Choice
  deleted: boolean
}
const blankLesson: LessonDraft = {
  title: '',
  url: '',
  order: '1',
  seeking: 'inherit',
  speed: 'inherit',
  deleted: false,
}
const field =
  'w-full min-w-0 rounded-xl border border-slate-300 bg-white p-3 text-base text-slate-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100'
const button =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-teal-600 disabled:cursor-not-allowed disabled:opacity-40'
const uid = () => `added-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
const errorText = (error: unknown) => {
  const code = (error as { code?: string })?.code
  return code === 'permission-denied'
    ? 'الحساب الحالي لا يملك صلاحية الإدارة. تحقق من تسجيل الدخول وصلاحية المدير.'
    : error instanceof Error
      ? error.message
      : 'تعذّر تنفيذ الطلب. تحقق من الاتصال.'
}
const choice = (value: boolean | null | undefined): Choice =>
  typeof value === 'boolean' ? (value ? 'allow' : 'block') : 'inherit'
const bool = (value: Choice) => (value === 'inherit' ? null : value === 'allow')
function draftFrom(book?: ManagedBook | null): Draft {
  const result = {
    category: book?.category || 'aqidah',
    level: book?.level || 'مبتدئ',
    deleted: book?.deleted || false,
    lessonSeekDefault: book?.lessonSeekDefault ?? true,
    lessonSpeedDefault: book?.lessonSpeedDefault ?? true,
    quranpediaBookId: book?.quranpediaBookId ? String(book.quranpediaBookId) : '',
    pdfParts: book?.pdfParts?.map((part) => ({ ...part })) || [],
  } as Draft
  for (const key of [...BOOK_TEXT_FIELDS, ...BOOK_LINK_FIELDS]) result[key] = book?.[key] || ''
  return result
}
function Label({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className="block min-w-0 space-y-2 text-sm font-bold text-slate-700">
      <span>{title}</span>
      {children}
    </label>
  )
}
function PolicySelect({
  value,
  onChange,
  label,
}: {
  value: Choice
  onChange: (value: Choice) => void
  label: string
}) {
  return (
    <Label title={label}>
      <select className={field} value={value} onChange={(event) => onChange(event.target.value as Choice)}>
        <option value="inherit">يتبع إعداد الكتاب</option>
        <option value="allow">مسموح</option>
        <option value="block">غير مسموح</option>
      </select>
    </Label>
  )
}

export default function IslamicLibraryAdmin() {
  const catalog = useManagedCatalog()
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [creating, setCreating] = useState(false)
  const detail = useManagedBook(selectedId)
  const selected = detail.book || catalog.books.find((book) => book.id === selectedId)
  const [draft, setDraft] = useState<Draft>(() => draftFrom())
  const [tab, setTab] = useState<'details' | 'lessons'>('details'),
    [section, setSection] = useState<'info' | 'links' | 'pdf'>('info')
  const [query, setQuery] = useState(''),
    [level, setLevel] = useState('all'),
    [category, setCategory] = useState('all'),
    [visibility, setVisibility] = useState('all')
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [dirty, setDirty] = useState(false)
  const [lessonId, setLessonId] = useState<string | null>(null),
    [lesson, setLesson] = useState<LessonDraft>(blankLesson)
  const [scope, setScope] = useState<'book' | 'library'>('book'),
    [bulkSeek, setBulkSeek] = useState(true),
    [bulkSpeed, setBulkSpeed] = useState(true)
  const [playlistDirty, setPlaylistDirty] = useState(false)
  const filtered = useMemo(
    () =>
      catalog.books.filter(
        (book) =>
          `${book.title} ${book.author} ${book.videoAuthor || ''}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()) &&
          (level === 'all' || book.level === level) &&
          (category === 'all' || book.category === category) &&
          (visibility === 'all' || book.deleted === (visibility === 'hidden')),
      ),
    [catalog.books, query, level, category, visibility],
  )
  const clearMessages = () => {
    setError('')
    setNotice('')
  }
  const selectBook = (book?: ManagedBook) => {
    if ((dirty || lessonId || playlistDirty) && !window.confirm('توجد تعديلات لم تُحفظ. الانتقال دون حفظها؟'))
      return
    setSelectedId(book?.id || null)
    setCreating(!book)
    setDraft(draftFrom(book))
    setDirty(false)
    setTab('details')
    setSection(book ? 'links' : 'info')
    setLessonId(null)
    setBulkSeek(book?.lessonSeekDefault ?? true)
    setBulkSpeed(book?.lessonSpeedDefault ?? true)
    clearMessages()
  }
  useEffect(() => {
    if (!dirty && !lessonId && !playlistDirty) return
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [dirty, lessonId, playlistDirty])
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => {
      const next = { ...current, [key]: value }
      if (
        key === 'downloadUrl' &&
        current.pdfParts.length === 1 &&
        current.pdfParts[0].url === current.downloadUrl
      )
        next.pdfParts = String(value).trim() ? [{ ...current.pdfParts[0], url: String(value) }] : []
      return next
    })
    setDirty(true)
  }
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    clearMessages()
    try {
      await work()
    } catch (error) {
      setError(errorText(error))
    } finally {
      setBusy(false)
    }
  }
  const removeBook = () => {
    if (
      !selectedId ||
      !selected?.custom ||
      !window.confirm(`حذف الكتاب المضاف «${selected.title}» ودروسه نهائيًا؟`)
    )
      return
    void run(async () => {
      if (!creating && (!detail.ready || detail.error))
        throw new Error('تعذّر تحميل البيانات الحالية. أعد تحميل الصفحة قبل تعديل الكتاب.')
      const snapshot = await getDocs(collection(db, 'islamicLibraryBooks', selectedId, 'videos'))
      for (let start = 0; start < snapshot.docs.length; start += 400) {
        const batch = writeBatch(db)
        snapshot.docs.slice(start, start + 400).forEach((item) => batch.delete(item.ref))
        await batch.commit()
      }
      await deleteDoc(doc(db, 'islamicLibraryBooks', selectedId))
      setSelectedId(null)
      setCreating(false)
      setDirty(false)
      setLessonId(null)
      setPlaylistDirty(false)
      setNotice('تم حذف الكتاب المضاف ودروسه.')
    })
  }
  const saveBook = () =>
    void run(async () => {
      if (!creating && (!detail.ready || detail.error))
        throw new Error('تعذّر تحميل البيانات الحالية. أعد تحميل الصفحة قبل تعديل الكتاب.')
      if (!draft.title.trim() || !draft.author.trim()) throw new Error('اكتب اسم الكتاب والمؤلف أولًا.')
      for (const key of BOOK_LINK_FIELDS)
        if (draft[key].trim() && !safeIslamicLibraryLink(draft[key]))
          throw new Error('أحد الروابط غير صالح. استخدم رابط HTTPS كاملًا.')
      if (
        draft.quranpediaBookId &&
        (!Number.isSafeInteger(Number(draft.quranpediaBookId)) || Number(draft.quranpediaBookId) <= 0)
      )
        throw new Error('معرّف الكتاب النصي يجب أن يكون رقمًا صحيحًا موجبًا، أو اتركه فارغًا.')
      for (const part of draft.pdfParts)
        if (!part.label.trim() || !safeIslamicLibraryLink(part.url))
          throw new Error('أكمل اسم ورابط HTTPS لكل جزء PDF، أو احذف الجزء الفارغ.')
      const id = selectedId || uid(),
        payload: Record<string, unknown> = {
          category: draft.category,
          level: draft.level,
          deleted: draft.deleted,
          lessonSeekDefault: draft.lessonSeekDefault,
          lessonSpeedDefault: draft.lessonSpeedDefault,
          quranpediaBookId: draft.quranpediaBookId ? Number(draft.quranpediaBookId) : null,
          pdfParts: draft.pdfParts.map((part) => ({ label: part.label.trim(), url: part.url.trim() })),
          updatedAt: serverTimestamp(),
        }
      for (const key of [...BOOK_TEXT_FIELDS, ...BOOK_LINK_FIELDS]) payload[key] = draft[key].trim()
      if (creating) payload.createdAt = serverTimestamp()
      await setDoc(doc(db, 'islamicLibraryBooks', id), payload, { merge: true })
      setDirty(false)
      setCreating(false)
      setSelectedId(id)
      setNotice('تم حفظ الكتاب والشرح والروابط. التغييرات مرتبطة مباشرة بصفحات الجمهور.')
    })
  const editLesson = (row?: ManagedLesson) => {
    const isCurrent = !selected?.lessonPolicyRevision || row?.policyRevision === selected.lessonPolicyRevision
    setLessonId(row?.id || '__new__')
    setLesson(
      row
        ? {
            title: row.title,
            url: row.url,
            order: String(row.order),
            seeking: choice(isCurrent ? row.allowSeeking : null),
            speed: choice(isCurrent ? row.allowSpeed : null),
            deleted: row.deleted === true,
          }
        : {
            ...blankLesson,
            order: String(Math.max(0, ...(selected?.videos || []).map((item) => item.order)) + 1),
          },
    )
  }
  const saveLesson = () =>
    void run(async () => {
      if (!selectedId || !selected || !detail.lessonsReady) throw new Error('انتظر تحميل الدروس الحالية.')
      if (!lesson.title.trim() || !safeIslamicLibraryLink(lesson.url))
        throw new Error('اكتب عنوان الدرس ورابط HTTPS صالحًا.')
      if (!Number.isSafeInteger(Number(lesson.order)) || Number(lesson.order) < 1)
        throw new Error('ترتيب الدرس يجب أن يكون رقمًا صحيحًا موجبًا.')
      await setDoc(
        doc(db, 'islamicLibraryBooks', selectedId, 'videos', lessonId === '__new__' ? uid() : lessonId!),
        {
          title: lesson.title.trim(),
          url: lesson.url.trim(),
          order: Number(lesson.order),
          deleted: lesson.deleted,
          allowSeeking: bool(lesson.seeking),
          allowSpeed: bool(lesson.speed),
          policyRevision: selected.lessonPolicyRevision,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setLessonId(null)
      setNotice('تم حفظ عنوان الدرس ورابطه وترتيبه وصلاحياته.')
    })
  const toggleLesson = (row: ManagedLesson) =>
    void run(async () => {
      if (!selectedId) return
      await setDoc(
        doc(db, 'islamicLibraryBooks', selectedId, 'videos', row.id),
        { deleted: !row.deleted, updatedAt: serverTimestamp() },
        { merge: true },
      )
      setNotice(row.deleted ? 'تم إظهار الدرس.' : 'تم إخفاء الدرس عن الجمهور.')
    })
  const applyBulk = () =>
    void run(async () => {
      if (!catalog.ready || catalog.error) throw new Error('انتظر تحميل جميع الكتب قبل التطبيق الجماعي.')
      if (scope === 'book' && !selected) throw new Error('اختر كتابًا أولًا.')
      if (dirty || lessonId || playlistDirty)
        throw new Error('احفظ التعديلات المفتوحة للكتاب أو الدرس أولًا قبل تطبيق الإعداد الجماعي.')
      const snapshot = await getDocsFromServer(collection(db, 'islamicLibraryBooks'))
      const currentBooks = mergeLibraryCatalog(
        snapshot.docs.map((item) => ({ id: item.id, data: item.data() })),
      )
      const targets = scope === 'book' ? currentBooks.filter((book) => book.id === selectedId) : currentBooks
      if (!targets.length) throw new Error('الكتاب المحدد لم يعد موجودًا. حدّث القائمة ثم أعد المحاولة.')
      const revision = uid()
      let committed = 0
      try {
        for (let start = 0; start < targets.length; start += 400) {
          const batch = writeBatch(db)
          targets.slice(start, start + 400).forEach((book) =>
            batch.set(
              doc(db, 'islamicLibraryBooks', book.id),
              {
                lessonSeekDefault: bulkSeek,
                lessonSpeedDefault: bulkSpeed,
                lessonPolicyRevision: revision,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            ),
          )
          await batch.commit()
          committed += Math.min(400, targets.length - start)
        }
      } catch (error) {
        throw new Error(`تم تحديث ${committed} كتاب قبل توقف الطلب. يمكنك إعادة التطبيق. ${errorText(error)}`)
      }
      setDraft((current) => ({ ...current, lessonSeekDefault: bulkSeek, lessonSpeedDefault: bulkSpeed }))
      setLessonId(null)
      setNotice(
        `تم تطبيق الإعداد على كل دروس ${scope === 'book' ? 'الكتاب' : `المكتبة (${committed} كتاب)`}، بما فيها الدروس الأصلية وقوائم YouTube. أُلغيت استثناءات الصلاحيات القديمة؛ ويمكن إضافة استثناء جديد لكل درس.`,
      )
    })
  const saveCurrentLesson = async (
    listId: string,
    number: number,
    edit: CurrentLessonEdit,
    reset: boolean,
  ) => {
    if (!selectedId || !selected) throw new Error('اختر الكتاب الحالي أولًا.')
    if (!reset && (!edit.title.trim() || !safeIslamicLibraryLink(edit.url)))
      throw new Error('أكمل عنوان الدرس ورابطه الحالي.')
    let replacement = ''
    if (!reset && edit.url.trim()) {
      const single = new URL(edit.url.trim())
      single.searchParams.delete('list')
      const videoId = youtubeSource(single.href)?.video
      if (!videoId) throw new Error('أدخل رابط فيديو YouTube واحد لهذا الدرس.')
      replacement = `https://www.youtube.com/watch?v=${videoId}`
    }
    const reference = doc(db, 'islamicLibraryBooks', selectedId)
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(reference),
        fresh = mergeLibraryBook(selectedId, snapshot.data())
      const policies: Record<string, PlaylistOverride> = { ...(fresh?.playlistPolicies || {}) }
      const key = playlistPolicyKey(listId, number)
      if (youtubeSource(fresh?.videoUrl)?.list === listId) delete policies[String(number)]
      if (reset) delete policies[key]
      else
        policies[key] = {
          title: edit.title.trim(),
          url: replacement,
          author: edit.author.trim(),
          deleted: edit.deleted,
          allowSeeking: bool(edit.seeking),
          allowSpeed: bool(edit.speed),
          policyRevision: fresh?.lessonPolicyRevision || '',
        }
      const payload = { playlistPolicies: policies, updatedAt: serverTimestamp() }
      if (snapshot.exists()) transaction.update(reference, payload)
      else transaction.set(reference, payload)
    })
    setPlaylistDirty(false)
    setNotice(reset ? 'تمت استعادة الدرس الأصلي.' : 'تم تعديل الدرس الحالي ورابطه الذي يظهر للجمهور.')
  }
  const linkLabels: Record<(typeof BOOK_LINK_FIELDS)[number], string> = {
    readingUrl: 'رابط قراءة الكتاب',
    downloadUrl: 'رابط تحميل الكتاب PDF',
    sharhUrl: 'رابط الشرح المكتوب',
    videoUrl: 'رابط الشرح المرئي الرئيسي / قائمة YouTube',
    audioUrl: 'رابط ملف الشرح الصوتي',
    audioSourceUrl: 'رابط مصدر الصوت',
    videoDownloadUrl: 'رابط تحميل الفيديو من الناشر',
  }
  return (
    <section dir="rtl" className="mt-6 space-y-5 text-slate-900">
      <fieldset disabled={busy} className="min-w-0 space-y-5">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-sm font-bold text-teal-700">إدارة المكتبة الشرعية</span>
              <h2 className="mt-2 text-2xl font-black">عدّل ما يراه الجمهور</h2>
              <p className="mt-2 text-sm leading-7 text-slate-500">
                اختر كتابًا حاليًا لتعديل بياناته وشرحه وروابطه ودروسه. جميع الكتب الأصلية والمضافة موجودة
                هنا.
              </p>
            </div>
            <button
              type="button"
              className={`${button} !bg-teal-800 !text-white`}
              disabled={busy || !catalog.ready}
              onClick={() => selectBook()}
            >
              <Plus size={18} />
              إضافة كتاب جديد
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-teal-50 px-3 py-2">
              {publicLibraryBooks(catalog.books).length} كتاب أساسي ظاهر
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-2">
              {catalog.books.filter((book) => book.deleted).length} كتاب مخفي
            </span>
          </div>
        </header>
        {selectedId && selected && !selected.deleted && <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm leading-7"><p>يظهر للجمهور كتاب واحد في كل مجال ومستوى. تبقى الكتب الأخرى وروابطها محفوظة هنا للإدارة.</p><button type="button" disabled={busy || !detail.ready || !!detail.error} className={`${button} mt-3`} onClick={() => void run(async () => { await setDoc(doc(db, 'islamicLibraryBooks', selectedId), { featuredAt: Date.now(), updatedAt: serverTimestamp() }, { merge: true }); setNotice('تم اختيار هذا الكتاب ليكون الكتاب الأساسي الوحيد في مجاله ومستواه.'); })}>جعل هذا الكتاب الأساسي في مجاله</button><p className="mt-2 text-xs text-slate-500">منهج الشهادات محفوظ؛ اختيار كتاب بديل للعرض لا يغير متطلبات شهادة أُصدرت سابقًا.</p></div>}
        {(error || notice || catalog.error || detail.error) && (
          <p
            role={error || catalog.error || detail.error ? 'alert' : 'status'}
            className={`sticky top-2 z-30 rounded-xl border p-4 text-sm leading-7 shadow-sm ${error || catalog.error || detail.error ? 'border-red-200 bg-red-50 text-red-800' : 'border-teal-200 bg-teal-50 text-teal-900'}`}
          >
            {error || catalog.error || detail.error || notice}
          </p>
        )}
        <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="rounded-3xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 font-black">
              <BookOpen size={18} />
              الكتب الحالية
            </h3>
            <label className="relative block">
              <Search size={17} className="absolute right-3 top-4 text-slate-400" />
              <input
                className={`${field} !pr-10`}
                aria-label="البحث في الكتب الحالية"
                placeholder="الكتاب أو المؤلف أو الشارح"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="my-3 grid grid-cols-2 gap-2">
              <select
                aria-label="تصفية بالمستوى"
                className={field}
                value={level}
                onChange={(event) => setLevel(event.target.value)}
              >
                <option value="all">كل المستويات</option>
                {SUNNI_LIBRARY_LEVELS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
              <select
                aria-label="تصفية بالمجال"
                className={field}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="all">كل المجالات</option>
                {SUNNI_LIBRARY_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="تصفية بالظهور"
                className={`${field} col-span-2`}
                value={visibility}
                onChange={(event) => setVisibility(event.target.value)}
              >
                <option value="all">الظاهر والمخفي</option>
                <option value="visible">الظاهر للجمهور</option>
                <option value="hidden">المخفي</option>
              </select>
            </div>
            {!catalog.ready && (
              <p className="p-3 text-sm">
                <Loader2 className="inline animate-spin" size={18} /> تحميل الكتب الحالية…
              </p>
            )}
            <div className="max-h-[65dvh] space-y-2 overflow-y-auto">
              {filtered.map((book) => (
                <button
                  type="button"
                  key={book.id}
                  disabled={busy || !catalog.ready}
                  onClick={() => selectBook(book)}
                  className={`w-full rounded-2xl border p-3 text-right disabled:opacity-50 ${selectedId === book.id ? 'border-teal-700 bg-teal-50' : 'border-slate-200 bg-white'}`}
                >
                  <span className="flex items-start justify-between gap-2 font-bold">
                    <span>{book.title}</span>
                    <Pencil size={16} className="shrink-0 text-teal-700" />
                  </span>
                  <span className="mt-1 block text-xs leading-6 text-slate-500">
                    {book.author} · {book.level}
                  </span>
                  <span className="mt-2 inline-block text-xs text-teal-700">
                    {book.deleted ? 'مخفي · يمكنك إظهاره' : 'تعديل الشرح الحالي والكتاب'}
                  </span>
                </button>
              ))}
              {catalog.ready && !filtered.length && (
                <p className="p-4 text-sm text-slate-500">لا توجد نتائج مطابقة.</p>
              )}
            </div>
          </aside>
          <div className="min-w-0 space-y-5">
            {selectedId || creating ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-teal-700">
                      {creating ? 'إضافة كتاب' : 'تعديل كتاب موجود'}
                    </p>
                    <h3 className="mt-1 text-xl font-black">{draft.title || 'كتاب جديد'}</h3>
                  </div>
                  {selectedId && (
                    <Link href={`/islamic-library/book/${selectedId}`} target="_blank" className={button}>
                      <ExternalLink size={16} />
                      معاينة للجمهور
                    </Link>
                  )}
                  {selected?.custom && (
                    <button type="button" className={`${button} !text-red-700`} onClick={removeBook}>
                      حذف الكتاب المضاف
                    </button>
                  )}
                </div>
                <div className="mb-5 flex gap-2 border-b pb-4">
                  <button
                    type="button"
                    className={`${button} ${tab === 'details' ? '!bg-teal-800 !text-white' : ''}`}
                    onClick={() => setTab('details')}
                  >
                    الشرح الحالي وبيانات الكتاب
                  </button>
                  <button
                    type="button"
                    disabled={creating || !detail.ready}
                    className={`${button} ${tab === 'lessons' ? '!bg-teal-800 !text-white' : ''}`}
                    onClick={() => {
                      if (
                        playlistDirty &&
                        !window.confirm('توجد تعديلات للدرس الحالي لم تُحفظ. الانتقال دون حفظها؟')
                      )
                        return
                      setPlaylistDirty(false)
                      setTab('lessons')
                    }}
                  >
                    <Video size={17} />
                    الدروس الحالية
                  </button>
                </div>
                {tab === 'details' ? (
                  <>
                    <nav aria-label="أقسام تعديل الكتاب" className="mb-5 flex flex-wrap gap-2">
                      {(
                        [
                          ['info', 'البيانات والظهور'],
                          ['links', 'الشرح الحالي والروابط'],
                          ['pdf', 'أجزاء PDF'],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          type="button"
                          key={id}
                          className={`${button} ${section === id ? '!border-teal-700 !text-teal-800' : ''}`}
                          onClick={() => {
                            if (
                              playlistDirty &&
                              id !== section &&
                              !window.confirm('توجد تعديلات للدرس الحالي لم تُحفظ. الانتقال دون حفظها؟')
                            )
                              return
                            if (id !== section) setPlaylistDirty(false)
                            setSection(id)
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </nav>
                    {section === 'info' && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Label title="اسم الكتاب">
                          <input
                            className={field}
                            value={draft.title}
                            onChange={(event) => update('title', event.target.value)}
                          />
                        </Label>
                        <Label title="المؤلف">
                          <input
                            className={field}
                            value={draft.author}
                            onChange={(event) => update('author', event.target.value)}
                          />
                        </Label>
                        <Label title="المستوى">
                          <select
                            className={field}
                            value={draft.level}
                            onChange={(event) => update('level', event.target.value as Draft['level'])}
                          >
                            {SUNNI_LIBRARY_LEVELS.map((item) => (
                              <option key={item.id}>{item.id}</option>
                            ))}
                          </select>
                        </Label>
                        <Label title="المجال">
                          <select
                            className={field}
                            value={draft.category}
                            onChange={(event) => update('category', event.target.value as Draft['category'])}
                          >
                            {SUNNI_LIBRARY_CATEGORIES.map((item) => (
                              <option value={item.id} key={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </Label>
                        <div className="sm:col-span-2">
                          <Label title="وصف الكتاب">
                            <textarea
                              rows={4}
                              className={field}
                              value={draft.description}
                              onChange={(event) => update('description', event.target.value)}
                            />
                          </Label>
                        </div>
                        <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm font-bold">
                          <input
                            type="checkbox"
                            checked={!draft.deleted}
                            onChange={(event) => update('deleted', !event.target.checked)}
                          />
                          ظاهر للجمهور
                        </label>
                        <Label title="معرّف Quranpedia للنص الداخلي (اختياري)">
                          <input
                            type="number"
                            min={1}
                            className={field}
                            value={draft.quranpediaBookId}
                            onChange={(event) => update('quranpediaBookId', event.target.value)}
                          />
                        </Label>
                      </div>
                    )}
                    {section === 'links' && (
                      <div className="space-y-5">
                        <p className="rounded-xl bg-teal-50 p-3 text-sm leading-7 text-teal-900">
                          هذه الروابط والبيانات الحالية. يمكنك استبدال أي رابط أو إفراغه لإزالته من العرض.
                        </p>
                        <section className="space-y-4 rounded-2xl border-2 border-teal-700 bg-white p-4">
                          <h4 className="font-black text-teal-900">الشرح الحالي المعروض للجمهور</h4>
                          <Label title="اسم الشارح الحالي">
                            <input
                              className={field}
                              value={draft.videoAuthor}
                              onChange={(event) => update('videoAuthor', event.target.value)}
                            />
                          </Label>
                          <Label title="رابط الشرح / قائمة الدروس الحالية">
                            <input
                              type="url"
                              dir="ltr"
                              className={field}
                              value={draft.videoUrl}
                              onChange={(event) => update('videoUrl', event.target.value)}
                            />
                          </Label>
                          <button
                            type="button"
                            className={`${button} !bg-teal-800 !text-white`}
                            disabled={busy || (!creating && !detail.ready)}
                            onClick={saveBook}
                          >
                            <Save size={16} />
                            حفظ تعديل الشرح الحالي
                          </button>
                        </section>
                        {selected && detail.ready && (
                          <CurrentExplanationEditor
                            key={selected.id}
                            book={selected}
                            disabled={busy}
                            onSave={saveCurrentLesson}
                            onDirtyChange={setPlaylistDirty}
                            onBusyChange={setBusy}
                          />
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                          {(['sharhTitle', 'sharhAuthor', 'readingLabel', 'sharhLabel'] as const).map(
                            (key) => (
                              <Label
                                key={key}
                                title={
                                  {
                                    sharhTitle: 'عنوان الشرح المكتوب',
                                    sharhAuthor: 'مؤلف الشرح المكتوب',
                                    videoAuthor: 'اسم الشارح المرئي',
                                    readingLabel: 'نص زر القراءة',
                                    sharhLabel: 'نص زر الشرح',
                                  }[key]
                                }
                              >
                                <input
                                  className={field}
                                  value={draft[key]}
                                  onChange={(event) => update(key, event.target.value)}
                                />
                              </Label>
                            ),
                          )}
                        </div>
                        {BOOK_LINK_FIELDS.filter((key) => key !== 'videoUrl').map((key) => (
                          <Label title={linkLabels[key]} key={key}>
                            <div className="flex items-center gap-2">
                              <input
                                type="url"
                                dir="ltr"
                                className={field}
                                value={draft[key]}
                                onChange={(event) => update(key, event.target.value)}
                                placeholder="https://…"
                              />
                              {safeIslamicLibraryLink(draft[key]) && (
                                <a
                                  aria-label={`فتح ${linkLabels[key]}`}
                                  className={button}
                                  href={safeIslamicLibraryLink(draft[key])!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink size={16} />
                                </a>
                              )}
                            </div>
                          </Label>
                        ))}
                        <Label title="ملاحظة المصادر المعروضة للجمهور">
                          <textarea
                            className={field}
                            rows={3}
                            value={draft.resourceNote}
                            onChange={(event) => update('resourceNote', event.target.value)}
                          />
                        </Label>
                        <p className="text-xs leading-6 text-slate-500">
                          عند تغيير ملف PDF، حدّث أجزاءه من تبويب «أجزاء PDF» أو احذف الأجزاء القديمة لاستخدام
                          رابط التحميل الجديد.
                        </p>
                      </div>
                    )}
                    {section === 'pdf' && (
                      <div className="space-y-4">
                        <p className="text-sm leading-7 text-slate-500">
                          تُعرض الأجزاء بالترتيب التالي. إذا كانت القائمة فارغة، يستخدم القارئ رابط تحميل
                          الكتاب الحالي.
                        </p>
                        {draft.pdfParts.map((part, index) => (
                          <div key={index} className="space-y-3 rounded-xl border p-3">
                            <div className="flex items-center gap-2">
                              <input
                                aria-label={`اسم الجزء ${index + 1}`}
                                className={field}
                                value={part.label}
                                onChange={(event) =>
                                  update(
                                    'pdfParts',
                                    draft.pdfParts.map((item, i) =>
                                      i === index ? { ...item, label: event.target.value } : item,
                                    ),
                                  )
                                }
                              />
                              <button
                                type="button"
                                className={button}
                                aria-label={`حذف الجزء ${index + 1}`}
                                onClick={() =>
                                  update(
                                    'pdfParts',
                                    draft.pdfParts.filter((_, i) => i !== index),
                                  )
                                }
                              >
                                <X size={17} />
                              </button>
                            </div>
                            <input
                              type="url"
                              dir="ltr"
                              aria-label={`رابط الجزء ${index + 1}`}
                              className={field}
                              value={part.url}
                              onChange={(event) =>
                                update(
                                  'pdfParts',
                                  draft.pdfParts.map((item, i) =>
                                    i === index ? { ...item, url: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          className={button}
                          onClick={() =>
                            update('pdfParts', [
                              ...draft.pdfParts,
                              { label: `الجزء ${draft.pdfParts.length + 1}`, url: '' },
                            ])
                          }
                        >
                          <Plus size={17} />
                          إضافة جزء PDF
                        </button>
                      </div>
                    )}
                    <div className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                      <label className="flex items-center gap-3 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={draft.lessonSeekDefault}
                          onChange={(event) => update('lessonSeekDefault', event.target.checked)}
                        />
                        السماح بتقديم وتأخير الفيديو افتراضيًا
                      </label>
                      <label className="flex items-center gap-3 text-sm font-bold">
                        <input
                          type="checkbox"
                          checked={draft.lessonSpeedDefault}
                          onChange={(event) => update('lessonSpeedDefault', event.target.checked)}
                        />
                        السماح بتغيير السرعة افتراضيًا
                      </label>
                      <p className="text-xs leading-6 text-slate-500 sm:col-span-2">
                        حفظ الإعداد الافتراضي يحافظ على استثناءات الدروس. لتطبيق إعداد واحد على كل الدروس،
                        استخدم التحكم الجماعي أدناه.
                      </p>
                    </div>
                    <div className="sticky bottom-3 mt-6 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
                      <button
                        type="button"
                        disabled={busy || (!creating && !detail.ready)}
                        className={`${button} !bg-teal-800 !text-white`}
                        onClick={saveBook}
                      >
                        {busy ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}حفظ كل
                        بيانات الكتاب
                      </button>
                      {dirty && (
                        <span className="text-xs font-bold text-amber-700">توجد تعديلات لم تُحفظ</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-slate-600">الدروس المنفردة وقوائم الشرح الإضافية</p>
                      <button
                        type="button"
                        className={button}
                        disabled={busy || !detail.lessonsReady}
                        onClick={() => editLesson()}
                      >
                        <Plus size={16} />
                        إضافة درس / قائمة
                      </button>
                    </div>
                    <p className="rounded-xl bg-slate-50 p-3 text-xs leading-6">
                      رابط الشرح الرئيسي موجود في «الشرح والروابط الحالية». القائمة أدناه تشمل الدروس الأصلية
                      المضمّنة والدروس المضافة سابقًا.
                    </p>
                    {!detail.lessonsReady && <p className="text-sm">جارٍ تحميل الدروس الحالية…</p>}
                    {selected?.videos.map((row) => {
                      const p = effectivePolicy(selected, row)
                      return (
                        <article key={row.id} className="rounded-xl border p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="font-bold">
                                {row.order}. {row.title}
                              </h4>
                              <p className="mt-1 break-all text-xs text-slate-500" dir="ltr">
                                {row.url}
                              </p>
                              <p className="mt-2 text-xs text-slate-500">
                                {row.deleted ? 'مخفي' : 'ظاهر'} · الشريط {p.allowSeeking ? 'مسموح' : 'ممنوع'}{' '}
                                · السرعة {p.allowSpeed ? 'مسموحة' : 'ممنوعة'}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className={button}
                                disabled={busy}
                                onClick={() => editLesson(row)}
                              >
                                <Pencil size={16} />
                                تعديل
                              </button>
                              <button
                                type="button"
                                className={button}
                                disabled={busy}
                                onClick={() => toggleLesson(row)}
                              >
                                {row.deleted ? <Eye size={16} /> : <EyeOff size={16} />}{' '}
                                {row.deleted ? 'إظهار' : 'إخفاء'}
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                    {lessonId && (
                      <div className="space-y-4 rounded-2xl border-2 border-teal-700 bg-teal-50/30 p-4">
                        <h4 className="font-black">
                          {lessonId === '__new__' ? 'درس جديد' : 'تعديل الدرس الحالي'}
                        </h4>
                        <Label title="عنوان الدرس / القائمة">
                          <input
                            className={field}
                            value={lesson.title}
                            onChange={(event) => setLesson({ ...lesson, title: event.target.value })}
                          />
                        </Label>
                        <Label title="رابط الدرس الحالي">
                          <input
                            className={field}
                            dir="ltr"
                            value={lesson.url}
                            onChange={(event) => setLesson({ ...lesson, url: event.target.value })}
                          />
                        </Label>
                        <Label title="الترتيب">
                          <input
                            type="number"
                            min={1}
                            className={field}
                            value={lesson.order}
                            onChange={(event) => setLesson({ ...lesson, order: event.target.value })}
                          />
                        </Label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <PolicySelect
                            label="التقديم والتأخير"
                            value={lesson.seeking}
                            onChange={(value) => setLesson({ ...lesson, seeking: value })}
                          />
                          <PolicySelect
                            label="تغيير السرعة"
                            value={lesson.speed}
                            onChange={(value) => setLesson({ ...lesson, speed: value })}
                          />
                        </div>
                        <label className="flex gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!lesson.deleted}
                            onChange={(event) => setLesson({ ...lesson, deleted: !event.target.checked })}
                          />
                          إظهار الدرس للجمهور
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className={`${button} !bg-teal-800 !text-white`}
                            disabled={busy}
                            onClick={saveLesson}
                          >
                            حفظ الدرس
                          </button>
                          <button type="button" className={button} onClick={() => setLessonId(null)}>
                            إلغاء
                          </button>
                        </div>
                      </div>
                    )}
                    <p className="rounded-xl bg-teal-50 p-3 text-sm leading-7 text-teal-900">
                      لتعديل دروس قائمة الشرح الحالية وروابطها، افتح «الشرح الحالي والروابط» من بيانات الكتاب.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-teal-300 bg-teal-50 p-8 text-center">
                <Pencil className="mx-auto mb-4 text-teal-700" />
                <h3 className="text-lg font-black">اختر كتابًا حاليًا لبدء تعديله</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  ستظهر بياناته وروابطه وشروحه المحفوظة، مع تعديل كل درس على حدة.
                </p>
              </div>
            )}
            <section className="space-y-4 rounded-3xl border border-teal-200 bg-white p-5">
              <h3 className="flex items-center gap-2 font-black">
                <Settings2 size={20} />
                التحكم الجماعي في كل الدروس
              </h3>
              <select
                aria-label="نطاق التطبيق الجماعي"
                className={field}
                value={scope}
                onChange={(event) => setScope(event.target.value as typeof scope)}
              >
                <option value="book">كل دروس الكتاب المحدد</option>
                <option value="library">كل دروس جميع كتب المكتبة</option>
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={bulkSeek}
                    onChange={(event) => setBulkSeek(event.target.checked)}
                  />
                  السماح بتحريك شريط الفيديو
                </label>
                <label className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={bulkSpeed}
                    onChange={(event) => setBulkSpeed(event.target.checked)}
                  />
                  السماح بتغيير سرعة التشغيل
                </label>
              </div>
              <p className="text-xs leading-7 text-slate-600">
                زر واحد يطبّق الاختيار على جميع الدروس الحالية، وأي دروس تُضاف لهذه الكتب لاحقًا، ويلغي
                استثناءات الصلاحيات القديمة. عناوين الدروس وروابطها وظهورها تبقى كما حفظتها، ويمكنك إضافة
                استثناء لأي درس بعد التطبيق.
              </p>
              <button
                type="button"
                className={`${button} !bg-teal-800 !text-white`}
                disabled={
                  busy ||
                  !catalog.ready ||
                  !!catalog.error ||
                  (scope === 'book' && (!selectedId || !detail.ready))
                }
                onClick={applyBulk}
              >
                {busy ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}تطبيق على{' '}
                {scope === 'book' ? 'كل دروس الكتاب' : 'كل دروس المكتبة'}
              </button>
              <p className="text-xs leading-6 text-slate-500">
                تعمل هذه الإعدادات داخل مشغل سميع. عند فتح المصدر الخارجي، تكون أدوات التشغيل تابعة للمصدر.
              </p>
            </section>
          </div>
        </div>
      </fieldset>
    </section>
  )
}
