
import Link from 'next/link'
import type { ReactNode } from 'react'

export default function AudioLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div dir="rtl">
      <nav
        aria-label="روابط المكتبة الصوتية"
        className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 pt-4"
      >
        <Link
          href="/audio"
          className="rounded-xl border border-emerald-800/20 px-4 py-2 text-sm font-medium text-emerald-800 dark:text-emerald-200"
        >
          المكتبة الصوتية
        </Link>

        <Link
          href="/audio/alafasy-riwayat"
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
        >
          مصحف الروايات — مشاري العفاسي
        </Link>
      </nav>

      {children}
    </div>
  )
}
