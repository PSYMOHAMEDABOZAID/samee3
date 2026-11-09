import { Suspense, type ReactNode } from 'react'
import AdhkarQuickPlayModes from '@/components/adhkar/AdhkarQuickPlayModes'

/** Add quick listening choices without replacing or removing the existing reader. */
export default function AdhkarReadLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f7f5ef]" dir="rtl">
      <div className="px-4 pt-4 sm:px-6">
        <Suspense fallback={null}><AdhkarQuickPlayModes /></Suspense>
      </div>
      {children}
    </div>
  )
}