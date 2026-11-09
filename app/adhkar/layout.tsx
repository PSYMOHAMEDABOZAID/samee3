// المسار على GitHub: app/adhkar/layout.tsx
'use client'

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, BookOpen, ChevronDown, Headphones, Loader2,
  Moon, Search, Sun, X,
} from 'lucide-react'
import AdhkarQuickPlayModes from '@/components/adhkar/AdhkarQuickPlayModes'
import {
  findAdhkarCategory, loadAdhkarCatalog, normalizeAdhkarSearch,
  readCachedAdhkar, type AdhkarCategory, type AdhkarDailyType,
} from '@/lib/adhkar-catalog'

type Daily = AdhkarDailyType
const DAILY: { id: Daily; title: string; icon: typeof Sun }[] = [
  { id: 'morning', title: 'الصباح', icon: Sun },
  { id: 'evening', title: 'المساء', icon: Moon },
  { id: 'sleep', title: 'النوم', icon: Moon },
  { id: 'waking', title: 'الاستيقاظ', icon: Sun },
]

function AdhkarHomeControls() {
  const params = useSearchParams()
  const categoryParam = Number(params.get('categoryId'))
  const categoryId = Number.isInteger(categoryParam) && categoryParam > 0 ? categoryParam : 0
  const rawType = params.get('type')
  const dailyType: Daily = rawType === 'evening' || rawType === 'sleep' || rawType === 'waking'
    ? rawType : 'morning'
  const [browseOther, setBrowseOther] = useState(categoryId > 0)
  const [categories, setCategories] = useState<AdhkarCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [readerId, setReaderId] = useState('')

  useEffect(() => {
    if (categoryId > 0) setBrowseOther(true)
  }, [categoryId])

  useEffect(() => {
    const refresh = () => {
      try { setReaderId(localStorage.getItem('samee3_adhkar_reciter') || '') }
      catch { /* Storage may be disabled on older devices. */ }
    }
    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    const afterClick = () => window.requestAnimationFrame(refresh)
    document.addEventListener('click', afterClick)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('click', afterClick)
    }
  }, [])

  useEffect(() => {
    if (!browseOther) return
    let cancelled = false
    const controller = new AbortController()
    const prepare = async () => {
      setLoading(true)
      setError(false)
      try {
        const cached = await readCachedAdhkar()
        if (!cancelled && cached?.length) setCategories(cached)
        const result = await loadAdhkarCatalog({ refresh: false, signal: controller.signal })
        if (!cancelled) setCategories(result.categories)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void prepare()
    return () => { cancelled = true; controller.abort() }
  }, [browseOther])

  const dailyCategoryIds = useMemo(() => new Set(
    DAILY.map(day => findAdhkarCategory(categories, day.id)?.id).filter((id): id is number => typeof id === 'number'),
  ), [categories])
  const otherCategories = useMemo(() => categories.filter(category => !dailyCategoryIds.has(category.id)), [categories, dailyCategoryIds])
  const normalizedQuery = normalizeAdhkarSearch(query).trim()
  const matches = useMemo(() => otherCategories.filter(category => {
    if (!normalizedQuery) return true
    if (normalizeAdhkarSearch(category.category).includes(normalizedQuery)) return true
    return category.array.some(item => normalizeAdhkarSearch(item.text).includes(normalizedQuery))
  }), [otherCategories, normalizedQuery])
  const selectedCategory = categories.find(category => category.id === categoryId)
  const entries = showAll || normalizedQuery ? matches : matches.slice(0, 6)
  const otherIsSelected = browseOther || categoryId > 0

  const goDaily = () => {
    setBrowseOther(false)
    setQuery('')
    setShowAll(false)
  }

  return (
    <section dir="rtl" aria-label="الأذكار: اختيار الورد أو الباب"
      className="mb-4 rounded-[24px] border border-[#e3d9c6] bg-[#fffdf9] p-3.5 shadow-[0_8px_25px_rgba(24,70,63,0.07)] sm:p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1c5b51] text-white">
          <Headphones size={21} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-[#174d47]">اختر وردك أو باب الأذكار</h2>
          <p className="mt-1 text-xs text-[#71817b]">اقرأ أو استمع، وكل الأذكار في مكان واحد</p>
        </div>
      </div>

      <div role="group" aria-label="أنواع الأذكار" className="mb-4 grid grid-cols-2 gap-2">
        <Link href="/adhkar?type=morning" scroll={false} onClick={goDaily}
          aria-current={!otherIsSelected ? 'page' : undefined}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 text-sm font-extrabold transition ${!otherIsSelected
            ? 'border-[#1c5b51] bg-[#1c5b51] text-white'
            : 'border-[#e3d8c6] bg-white text-[#45635a]'}`}>
          <Sun size={17} /> الأوراد اليومية
        </Link>
        <button type="button" onClick={() => setBrowseOther(true)} aria-pressed={otherIsSelected}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 text-sm font-extrabold transition ${otherIsSelected
            ? 'border-[#1c5b51] bg-[#1c5b51] text-white'
            : 'border-[#e3d8c6] bg-white text-[#45635a]'}`}>
          <BookOpen size={17} /> باقي الأذكار
        </button>
      </div>

      {otherIsSelected ? (
        <div>
          <div className="relative mb-3">
            <Search aria-hidden="true" size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#a4824c]" />
            <input type="search" value={query} onChange={event => { setQuery(event.target.value); setShowAll(false) }}
              placeholder="ابحث عن أذكار السفر، الطعام، الدعاء…" aria-label="البحث في باقي أبواب الأذكار"
              className="min-h-12 w-full rounded-xl border border-[#e3d7c3] bg-white py-2 pl-10 pr-10 text-sm text-[#23524d] outline-none placeholder:text-[#899591] focus:border-[#b99660]" />
            {query && <button aria-label="مسح البحث" type="button" onClick={() => setQuery('')}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-[#647e75]"><X size={16} /></button>}
          </div>
          <div className="mb-3 flex items-center justify-between gap-2 text-xs text-[#71817b]">
            <span>{otherCategories.length.toLocaleString('ar-EG')} بابًا إضافيًا للقراءة والتشغيل حيث يتوفر الصوت</span>
            <span className="shrink-0 font-bold text-[#9e7a46]">{matches.length.toLocaleString('ar-EG')} نتيجة</span>
          </div>
          {loading && categories.length === 0 && <p role="status" className="flex items-center gap-2 py-5 text-xs text-[#647a73]"><Loader2 size={16} className="animate-spin" /> جارٍ تحميل أبواب الأذكار…</p>}
          {error && categories.length === 0 && <p role="status" className="py-3 text-xs text-[#886b43]">تعذر تحميل الأذكار. افتح القسم مرة أثناء الاتصال، ثم حاول من جديد.</p>}
          {!loading && matches.length === 0 && categories.length > 0 && <p role="status" className="py-3 text-xs text-[#7a8680]">لا توجد نتائج، جرّب كلمة أقصر.</p>}
          <div className={`grid gap-2 ${showAll || normalizedQuery ? 'max-h-[44dvh] overflow-y-auto overscroll-contain pr-0.5' : ''} sm:grid-cols-2`}>
            {entries.map(category => (
              <Link key={category.id} href={`/adhkar?categoryId=${category.id}`} scroll={false}
                aria-current={category.id === categoryId ? 'page' : undefined}
                className={`flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2 text-right transition-colors ${category.id === categoryId
                  ? 'border-[#5d9581] bg-[#edf5ef] text-[#185b4e]'
                  : 'border-[#e7ddcd] bg-white text-[#315a51] hover:border-[#c7ab7b]'}`}>
                <BookOpen size={17} className="shrink-0 text-[#a58451]" />
                <span className="min-w-0 flex-1"><span className="block text-xs font-extrabold leading-5">{category.category}</span>
                  <span className="mt-0.5 block text-[11px] text-[#83928a]">{category.array.length.toLocaleString('ar-EG')} ذكرًا ودعاءً</span>
                </span>
                <ArrowLeft size={15} className="shrink-0 opacity-60" />
              </Link>
            ))}
          </div>
          {!normalizedQuery && matches.length > 6 && (
            <button type="button" onClick={() => setShowAll(value => !value)} aria-expanded={showAll}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#dfd2bc] bg-[#f9f5ed] px-3 text-xs font-extrabold text-[#386457]">
              {showAll ? 'عرض عدد أقل من الأبواب' : `عرض جميع الأبواب (${matches.length.toLocaleString('ar-EG')})`}
              <ChevronDown size={16} className={showAll ? 'rotate-180' : ''} />
            </button>
          )}
          {categoryId > 0 && (
            <div className="mt-4 rounded-2xl border border-[#bed5ca] bg-[#f0f7f2] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-extrabold text-[#185b4e]">{selectedCategory?.category || 'الباب المختار'}</p>
                <Link href={`/adhkar/read?categoryId=${categoryId}${readerId ? `&reciter=${encodeURIComponent(readerId)}` : ''}`}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#1b5d50] px-3 text-xs font-bold text-white">
                  <BookOpen size={15} /> اقرأ هذا الباب
                </Link>
              </div>
              <Suspense fallback={null}><AdhkarQuickPlayModes compact /></Suspense>
            </div>
          )}
          {categoryId === 0 && <p className="mt-3 text-[11px] leading-6 text-[#76837d]">اختر بابًا من القائمة؛ ستظهر خيارات القراءة والتسجيلات المتاحة له.</p>}
        </div>
      ) : (
        <div>
          <div role="group" aria-label="الأوراد اليومية" className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DAILY.map(({ id, title, icon: Icon }) => (
              <Link key={id} href={`/adhkar?type=${id}`} scroll={false}
                aria-current={dailyType === id ? 'page' : undefined}
                className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-extrabold ${dailyType === id
                  ? 'border-[#1c5b51] bg-[#1c5b51] text-white'
                  : 'border-[#e3d7c3] bg-white text-[#45635a]'}`}>
                <Icon size={16} aria-hidden="true" /> {title}
              </Link>
            ))}
          </div>
          <Suspense fallback={null}><AdhkarQuickPlayModes compact /></Suspense>
          <Link href={`/adhkar/read?type=${dailyType}${readerId ? `&reciter=${encodeURIComponent(readerId)}` : ''}`}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#d8c8ab] px-4 text-xs font-extrabold text-[#245950]">
            <BookOpen size={16} /> اقرأ الورد كاملًا <ArrowLeft size={15} />
          </Link>
        </div>
      )}
    </section>
  )
}

/** Put the controls directly below the already-present heading, without replacing the 1084-line page. */
function InsertAdhkarControls() {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    let element: HTMLElement | null = null
    let observer: MutationObserver | null = null
    const place = () => {
      const header = document.querySelector<HTMLElement>('[data-samee3-adhkar-home="yes"] main > div > header')
      if (!header) return
      if (element?.isConnected && element.previousElementSibling === header) { observer?.disconnect(); return }
      element?.remove()
      element = document.createElement('div')
      element.setAttribute('data-samee3-adhkar-control-slot', '')
      header.insertAdjacentElement('afterend', element)
      setHost(element)
      observer?.disconnect()
    }
    place()
    if (!element && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(place)
      observer.observe(document.body, { childList: true, subtree: true })
      place()
    }
    return () => { observer?.disconnect(); element?.remove() }
  }, [])
  return host ? createPortal(<Suspense fallback={null}><AdhkarHomeControls /></Suspense>, host) : null
}

/** The read page and 132 category records are not replaced, so old settings and counters stay intact. */
export default function AdhkarLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const isHome = pathname === '/adhkar' || pathname === '/adhkar/'
  return (
    <div data-samee3-adhkar-home={isHome ? 'yes' : undefined}>
      {children}
      {isHome && (
        <>
          <InsertAdhkarControls />
          <style>{`
            [data-samee3-adhkar-home="yes"] main > div > header { margin-bottom: 14px !important; }
            /* The existing introductory panel stays present, but becomes a slim facts strip. */
            [data-samee3-adhkar-home="yes"] main > div > section.relative.overflow-hidden {
              padding: 12px 15px !important; border-radius: 18px !important; box-shadow: none !important;
              margin-top: 10px;
            }
            [data-samee3-adhkar-home="yes"] main > div > section.relative.overflow-hidden > .pointer-events-none { display: none !important; }
            [data-samee3-adhkar-home="yes"] main > div > section.relative.overflow-hidden .relative.z-10.grid { display: block !important; }
            [data-samee3-adhkar-home="yes"] main > div > section.relative.overflow-hidden .relative.z-10.grid > div:last-child { display: none !important; }
            [data-samee3-adhkar-home="yes"] main > div > section.relative.overflow-hidden h2,
            [data-samee3-adhkar-home="yes"] main > div > section.relative.overflow-hidden p { display: none !important; }
            [data-samee3-adhkar-home="yes"] main > div > section.relative.overflow-hidden .mt-5 { margin-top: 9px !important; }
            [data-samee3-adhkar-home="yes"] main > div > a[href="/adhkar/recordings"] {
              min-height: 62px !important; margin-bottom: 0 !important; padding: 12px 15px !important;
              border-radius: 17px !important;
            }
            [data-samee3-adhkar-home="yes"] main > div > section.mt-5.grid { margin-top: 14px !important; }
          `}</style>
        </>
      )}
    </div>
  )
}
