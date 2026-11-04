'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, CheckCircle2, ChevronLeft, Loader2, Search } from 'lucide-react'
import { LEARNING_LEVELS, type LevelId } from '@/lib/islamic/curriculum'
import { SUNNI_LIBRARY_CATEGORIES } from '@/lib/islamic/sunniLibrary'
import { useLearningProgress } from '@/lib/islamic/learning-progress'
import { useManagedCatalog } from '@/lib/islamic/use-managed-library'
import { publicLibraryBooks } from '@/lib/islamic/managed-library'

export default function ManagedCategoryView({
  levelId,
  categoryId,
}: {
  levelId: LevelId
  categoryId: string
}) {
  const progress = useLearningProgress(),
    catalog = useManagedCatalog()
  const [query, setQuery] = useState('')
  const level = LEARNING_LEVELS.find((item) => item.id === levelId)!
  const category = SUNNI_LIBRARY_CATEGORIES.find((item) => item.id === categoryId)!
  const books = useMemo(
    () =>
      publicLibraryBooks(catalog.books).filter(
        (book) =>
          !book.deleted &&
          book.levelId === levelId &&
          book.category === categoryId &&
          `${book.title} ${book.author} ${book.description}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [catalog.books, levelId, categoryId, query],
  )
  return (
    <div dir="rtl" className="min-h-screen bg-[#f7f5ee] pb-28 text-[#203f43]">
      <div className="h-1 bg-gradient-to-l from-[#98713c] via-[#d9c39b] to-[#175759]" />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-7 sm:py-10">
        <Link
          href={`/islamic-library/level/${levelId}`}
          className="mb-7 inline-flex items-center gap-2 text-sm text-[#687b79]"
        >
          <ArrowRight size={17} />
          {level.name}
        </Link>
        <p className="mb-2 text-xs font-bold text-[#a47a3e]">
          {level.name} / {category.label}
        </p>
        <h1 className="mb-8 text-3xl font-black sm:text-4xl">{category.label}</h1>
        <label className="mb-6 flex max-w-xl items-center gap-3 rounded-2xl border border-[#ddd2bc] bg-white px-4 py-3">
          <Search size={18} className="text-[#a88b54]" />
          <input
            aria-label="البحث في كتب المجال"
            placeholder="ابحث بالكتاب أو المؤلف"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent text-base outline-none"
          />
        </label>
        {catalog.error && (
          <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm">
            {catalog.error}
          </p>
        )}
        {!catalog.ready ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 rounded-2xl bg-white p-8 text-sm"
          >
            <Loader2 className="animate-spin" size={18} />
            جارٍ تحميل الكتب…
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {books.map((book) => (
              <Link
                key={book.id}
                href={`/islamic-library/book/${book.id}`}
                className="group flex gap-5 rounded-3xl border border-[#ded5c5] bg-white p-5 transition hover:shadow-md"
              >
                <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-l-2xl rounded-r-sm border-r-4 border-[#aa8143] bg-[#1b4849] text-[#d4b57a]">
                  <BookOpen size={30} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <h2 className="mb-2 text-lg font-black">{book.title}</h2>
                  <p className="mb-3 text-xs text-[#7c877f]">{book.author}</p>
                  {book.videoAuthor && <p className="mb-3 text-xs text-[#7c877f]">شرح {book.videoAuthor}</p>}
                  <span className="flex items-center gap-2 text-xs font-bold text-[#96703c]">
                    {progress.completed.includes(book.id) ? (
                      <>
                        <CheckCircle2 size={17} />
                        أتممت دراسة الكتاب
                      </>
                    ) : (
                      <>
                        افتح الكتاب والشرح
                        <ChevronLeft size={17} />
                      </>
                    )}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
        {catalog.ready && !books.length && (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">لا توجد كتب مطابقة.</p>
        )}
      </main>
    </div>
  )
}
