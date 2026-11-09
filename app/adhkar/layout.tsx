'use client'

import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Headphones, Moon, Play, Sun } from 'lucide-react'
import AdhkarQuickPlayModes from '@/components/adhkar/AdhkarQuickPlayModes'

type Daily = 'morning' | 'evening' | 'sleep' | 'waking'
const DAILY: { id: Daily; title: string; icon: typeof Sun }[] = [
  { id: 'morning', title: 'الصباح', icon: Sun },
  { id: 'evening', title: 'المساء', icon: Moon },
  { id: 'sleep', title: 'النوم', icon: Moon },
  { id: 'waking', title: 'الاستيقاظ', icon: Sun },
]

function MainAdhkarQuickListening() {
  const search = useSearchParams()
  const selected: Daily = search.get('type') === 'evening' || search.get('type') === 'sleep' ||
    search.get('type') === 'waking' ? search.get('type') as Daily : 'morning'

  return (
    <section dir="rtl" aria-label="التشغيل السريع للأذكار" className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-7 sm:pt-8">
      <div className="rounded-[25px] border border-[#d9c5a2] bg-[#f9f3e9] p-4 shadow-[0_6px_25px_rgba(36,78,69,0.08)] sm:p-5">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#215a50] text-white"><Headphones size={22}/></span>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-base font-black text-[#194f43] sm:text-lg"><Play size={17} fill="currentColor"/> تشغيل الأذكار مباشرة</h2>
            <p className="mt-1 text-xs leading-5 text-[#637a73]">اختر الورد، ثم شغّل التسجيل كاملًا أو استمع للأذكار واحدًا بعد الآخر</p>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-4 gap-1.5 sm:gap-2" role="group" aria-label="اختيار الورد الصوتي">
          {DAILY.map(({ id, title, icon: Icon }) => (
            <Link key={id} href={`/adhkar?type=${id}`} scroll={false} aria-current={selected === id ? 'true' : undefined}
              className={`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-bold transition sm:px-3 sm:text-sm ${selected === id ? 'border-[#1e594f] bg-[#1e594f] text-white' : 'border-[#d7c7ad] bg-white text-[#365e55]'}`}>
              <Icon size={15} aria-hidden="true" className="shrink-0"/><span>{title}</span>
            </Link>
          ))}
        </div>
        <AdhkarQuickPlayModes />
      </div>
    </section>
  )
}

/** Quick play is on the Adhkar landing screen, not hidden on the reading page. */
export default function AdhkarLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const onHome = pathname.replace(/\/$/, '') === '/adhkar'
  return <>
    {onHome && <Suspense fallback={null}><MainAdhkarQuickListening /></Suspense>}
    {children}
  </>
}