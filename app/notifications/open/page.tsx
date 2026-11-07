'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

function integer(raw: string | null, max: number): number | null {
  if (!raw || !/^[0-9]{1,9}$/.test(raw)) return null
  const number = Number(raw)
  return Number.isSafeInteger(number) && number > 0 && number <= max ? number : null
}
function storedReading(): URLSearchParams {
  const query = new URLSearchParams()
  for (const key of ['samee3_persistent_reading_v2', 'samee3_persistent_audio_v2']) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null')
      if (!value || typeof value !== 'object') continue
      const page = integer(String(value.lastReadPage ?? value.page ?? ''), 604)
      if (!page) continue
      query.set('page', String(page))
      const riwaya = value.lastReadRiwayaId ?? value.riwaya
      if (typeof riwaya === 'string' && ['hafs', 'warsh', 'qalun', 'douri', 'shubah', 'sousi', 'bazzi'].includes(riwaya)) query.set('riwaya', riwaya)
      const ref = String(value.lastReadAyahKey ?? '')
      if (/^(?:[1-9]|[1-9][0-9]{1,2}):(?:[1-9]|[1-9][0-9]{1,2})$/.test(ref)) query.set('ayah', ref)
      const reciter = integer(String(value.lastReadReciterId ?? value.reciterId ?? ''), 100000)
      if (reciter) query.set('reciterId', String(reciter))
      return query
    } catch { /* no reading stored */ }
  }
  return query
}
function Destination() {
  const router = useRouter()
  const params = useSearchParams()
  const [fallback, setFallback] = useState('/notifications')
  const queryString = params.toString()
  useEffect(() => {
    const type = params.get('type') || params.get('kind') || 'reading'
    let path = '/notifications'
    if (type === 'reading' || type === 'resume') {
      const saved = storedReading()
      path = '/mushaf' + (saved.size ? '?' + saved.toString() : '')
    }
    if (type === 'ayah' || type === 'quran' || type === 'verse') {
      const surah = integer(params.get('surah'), 114)
      const ayah = integer(params.get('ayah'), 286)
      const page = integer(params.get('page'), 604)
      if (surah && ayah && page) path = `/mushaf?page=${page}&ayah=${surah}%3A${ayah}`
      else if (surah && ayah) path = `/notifications/verse?surah=${surah}&ayah=${ayah}`
      else path = '/mushaf'
    }
    if (type === 'hadith') {
      const book = params.get('book')
      const chapter = integer(params.get('chapter'), 100000)
      const hadith = integer(params.get('hadith'), 1000000)
      const id = params.get('id')
      if (book && /^[a-z0-9_]{1,60}$/i.test(book) && chapter && hadith) path = `/hadith?book=${encodeURIComponent(book)}&chapter=${chapter}&hadith=${hadith}`
      else if (id && /^[a-z0-9_-]{1,80}$/i.test(id)) path = `/notifications/hadith?id=${encodeURIComponent(id)}`
      else path = '/hadith'
    }
    if (type === 'adhkar' || type === 'dhikr') {
      const section = params.get('section') || 'morning'
      const safeSection = ['morning', 'evening', 'sleep', 'waking'].includes(section) ? section : 'morning'
      const itemId = integer(params.get('itemId'), 10000000)
      const categoryId = integer(params.get('categoryId'), 1000000)
      const query = new URLSearchParams({ type: safeSection })
      if (categoryId) query.set('categoryId', String(categoryId))
      if (itemId) query.set('itemId', String(itemId))
      path = itemId ? '/notifications/adhkar?' + query.toString() : '/adhkar/read?' + query.toString()
    }
    if (type === 'prayer') path = '/prayer'
    if (type === 'audio') path = '/audio'
    if (type === 'library') path = '/islamic-library'
    if (type === 'visual') path = '/visual-ayahs'
    setFallback(path)
    router.replace(path)
  }, [queryString, router])
  return <main dir="rtl" className="mx-auto min-h-screen max-w-xl p-6 text-center"><h1 className="mb-4 text-xl font-bold">جارٍ فتح المحتوى من إشعار سميع…</h1><Link className="text-emerald-800 underline" href={fallback}>فتح المحتوى</Link></main>
}
export default function NotificationOpen() {
  return <Suspense fallback={<main dir="rtl" className="p-6 text-center">جارٍ فتح المحتوى…</main>}><Destination /></Suspense>
}
