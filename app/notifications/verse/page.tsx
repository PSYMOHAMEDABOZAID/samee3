'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
function Detail() {
  const params = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState('')
  const queryString = params.toString()
  useEffect(() => {
    const surah = Number(params.get('surah'))
    const ayah = Number(params.get('ayah'))
    if (!Number.isSafeInteger(surah) || surah < 1 || surah > 114 || !Number.isSafeInteger(ayah) || ayah < 1 || ayah > 286) { setError('رقم الآية غير صالح.'); return }
    const controller = new AbortController()
    // The page number is not inferred from the verse number. Use a verified Quran API when needed.
    const url = `https://api.alquran.cloud/v1/ayah/${surah}:${ayah}`
    fetch(url, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('لم يتم تحميل مرجع الآية')
      const json: unknown = await response.json()
      if (!json || typeof json !== 'object') throw new Error('استجابة غير صالحة')
      const data = (json as { data?: { page?: unknown } }).data
      const page = Number(data?.page)
      if (!Number.isSafeInteger(page) || page < 1 || page > 604) throw new Error('رقم الصفحة غير متاح')
      router.replace(`/mushaf?page=${page}&ayah=${surah}%3A${ayah}&riwaya=hafs`)
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'تعذر فتح الآية') })
    return () => controller.abort()
  }, [queryString, router])
  return <main dir="rtl" className="mx-auto min-h-screen max-w-xl p-6 text-center"><h1 className="text-xl font-bold">فتح الآية في المصحف</h1><p className="mt-4 text-sm">{error || 'جارٍ تحديد الصفحة الصحيحة…'}</p><Link href="/mushaf" className="mt-5 inline-block text-emerald-800 underline">فتح المصحف</Link></main>
}
export default function VerseDetails() { return <Suspense fallback={<p dir="rtl" className="p-8">جارٍ التحميل…</p>}><Detail /></Suspense> }
