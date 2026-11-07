'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { findAdhkarCategory, loadAdhkarCatalog, readCachedAdhkar, type AdhkarCategory } from '@/lib/adhkar-catalog'

type Match = { category: AdhkarCategory; item: AdhkarCategory['array'][number] }
function AdhkarNotificationContent() {
  const params = useSearchParams()
  const itemId = Number(params.get('itemId') || '0')
  const categoryId = Number(params.get('categoryId') || '0')
  const source = params.get('type') || 'morning'
  const type = ['morning', 'evening', 'sleep', 'waking'].includes(source) ? source as 'morning' | 'evening' | 'sleep' | 'waking' : 'morning'
  const [categories, setCategories] = useState<AdhkarCategory[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    const controller = new AbortController()
    let running = true
    void (async () => {
      const cached = await readCachedAdhkar()
      if (!running) return
      if (cached?.length) { setCategories(cached); setState('ready') }
      try {
        const result = await loadAdhkarCatalog({ signal: controller.signal })
        if (running) { setCategories(result.categories); setState('ready') }
      } catch {
        if (running && !cached?.length) setState('error')
      }
    })()
    return () => { running = false; controller.abort() }
  }, [])
  const matches = useMemo(() => {
    if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > 10000000) return []
    const preferred = Number.isSafeInteger(categoryId) && categoryId > 0 ? categories.filter(c => c.id === categoryId) : (() => {
      const selected = findAdhkarCategory(categories, type)
      return selected ? [selected] : categories
    })()
    return preferred.flatMap(category => category.array.filter(item => item.id === itemId).map(item => ({ category, item } satisfies Match)))
  }, [categories, categoryId, itemId, type])
  const selected = matches.length === 1 ? matches[0] : null
  const readerHref = selected ? `/adhkar/read?type=${type}&categoryId=${selected.category.id}` : `/adhkar/read?type=${type}`
  return <main dir="rtl" className="min-h-screen bg-[#f7f6f1] px-4 pb-28 pt-8 text-[#173e32]">
    <article className="mx-auto max-w-2xl rounded-3xl border border-[#e5d9c3] bg-white p-6 shadow-sm sm:p-9">
      <Link href="/adhkar" className="text-sm font-semibold text-emerald-800">← الأذكار</Link>
      <h1 className="mt-5 text-2xl font-black">الذكر الوارد في الإشعار</h1>
      {state === 'loading' && <p className="mt-6 text-sm">جارٍ تحميل نص الذكر من مصدر سميع…</p>}
      {state === 'error' && <p className="mt-6 text-sm">تعذّر تحميل الأذكار. افتح القسم أثناء الاتصال أو بعد حفظ الأذكار للعمل دون إنترنت.</p>}
      {state === 'ready' && !selected && <p className="mt-6 text-sm">لا يمكن التحقق من الذكر المحدد{matches.length > 1 ? ' لأن المعرّف يتكرر بين أكثر من قسم. أرسل categoryId مع الإشعار.' : ' في المصدر المتاح.'}</p>}
      {selected && <>
        <p className="mt-5 text-sm font-bold text-[#98743e]">{selected.category.category}</p>
        <p className="mt-5 whitespace-pre-wrap text-xl leading-[2.4] text-slate-800">{selected.item.text}</p>
        <p className="mt-4 text-sm text-slate-600">العدد: {selected.item.count}</p>
        {(selected.item.reference || selected.item.source) && <p className="mt-4 border-t pt-4 text-sm text-slate-600">{selected.item.reference || selected.item.source}</p>}
      </>}
      <Link href={readerHref} className="mt-8 inline-flex rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white">فتح الأذكار للاستماع والمتابعة</Link>
    </article>
  </main>
}
export default function NotificationDhikr() { return <Suspense fallback={<p dir="rtl" className="p-8">جارٍ فتح الذكر…</p>}><AdhkarNotificationContent /></Suspense> }
