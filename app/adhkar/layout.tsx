// المسار على GitHub: app/adhkar/layout.tsx
'use client'

import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Headphones, Moon, Sun } from 'lucide-react'
import AdhkarQuickPlayModes from '@/components/adhkar/AdhkarQuickPlayModes'

type Daily = 'morning' | 'evening' | 'sleep' | 'waking'
const DAILY: { id: Daily; title: string; icon: typeof Sun }[] = [
  { id: 'morning', title: 'الصباح', icon: Sun },
  { id: 'evening', title: 'المساء', icon: Moon },
  { id: 'sleep', title: 'النوم', icon: Moon },
  { id: 'waking', title: 'الاستيقاظ', icon: Sun },
]

/**
 * A single listening card, positioned AFTER the existing home-page header.
 * The original 1,084-line app/adhkar/page.tsx stays untouched, along with
 * its search, reading progress, daily cards, saved settings and offline data.
 */
function AdhkarListeningCard() {
  const params = useSearchParams()
  const raw = params.get('type')
  const selected: Daily = raw === 'evening' || raw === 'sleep' || raw === 'waking' ? raw : 'morning'

  return (
    <section
      dir="rtl"
      aria-label="تشغيل أوراد الأذكار"
      className="mb-4 overflow-hidden rounded-[24px] border border-[#e4d8c5] bg-white p-4 shadow-[0_8px_28px_rgba(25,73,65,0.07)] sm:p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1c5b51] text-white">
          <Headphones size={21} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-[#174e49] sm:text-lg">استمع لوردك</h2>
          <p className="mt-1 text-xs leading-6 text-[#71817b]">
            اختر الورد وطريقة الاستماع، وسيظهر التحكم في المشغل العائم.
          </p>
        </div>
      </div>

      <div role="group" aria-label="اختيار الورد" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DAILY.map(({ id, title, icon: Icon }) => (
          <Link
            key={id}
            href={`/adhkar?type=${id}`}
            scroll={false}
            aria-current={selected === id ? 'true' : undefined}
            className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border px-2 text-xs font-extrabold transition-colors sm:text-sm ${
              selected === id
                ? 'border-[#1c5b51] bg-[#1c5b51] text-white shadow-sm'
                : 'border-[#e2d7c4] bg-[#fcfaf6] text-[#45635a] hover:border-[#b69b6b]'
            }`}
          >
            <Icon size={16} aria-hidden="true" />
            {title}
          </Link>
        ))}
      </div>

      <AdhkarQuickPlayModes compact />
    </section>
  )
}

/** Render into the actual content flow, without duplicating the site's header. */
function AdhkarHomeInsertion() {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let host: HTMLElement | null = null
    let observer: MutationObserver | null = null

    const insertAfterHeader = () => {
      const header = document.querySelector<HTMLElement>(
        '[data-samee3-adhkar-organized] main > div > header',
      )
      if (!header) return
      if (host?.isConnected && host.previousElementSibling === header) {
        observer?.disconnect()
        return
      }
      host?.remove()
      host = document.createElement('div')
      host.setAttribute('data-samee3-adhkar-quick-slot', '')
      header.insertAdjacentElement('afterend', host)
      setTarget(host)
      observer?.disconnect()
    }

    // React's effect normally runs after the page has mounted; observe only
    // if streaming/Suspense hasn't rendered the header yet.
    insertAfterHeader()
    if (!host && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(insertAfterHeader)
      observer.observe(document.body, { childList: true, subtree: true })
      insertAfterHeader()
    }
    return () => {
      observer?.disconnect()
      host?.remove()
    }
  }, [])

  return target ? createPortal(
    <Suspense fallback={null}><AdhkarListeningCard /></Suspense>,
    target,
  ) : null
}

/** Only the Adhkar landing page is reorganized; subpages stay unchanged. */
export default function AdhkarLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const home = pathname === '/adhkar' || pathname === '/adhkar/'

  return (
    <div data-samee3-adhkar-organized={home ? 'yes' : undefined}>
      {children}
      {home && (
        <>
          <AdhkarHomeInsertion />
          <style>{`
            /* Turn the existing oversized introductory banner into a slim
               information strip. Keep its offline status and item counts. */
            [data-samee3-adhkar-organized="yes"] main > div > section.relative.overflow-hidden {
              padding: 12px 16px !important;
              border-radius: 19px !important;
              box-shadow: none !important;
              margin-top: 12px;
            }
            [data-samee3-adhkar-organized="yes"] main > div > section.relative.overflow-hidden > .pointer-events-none {
              display: none !important;
            }
            [data-samee3-adhkar-organized="yes"] main > div > section.relative.overflow-hidden .relative.z-10.grid {
              display: block !important;
            }
            [data-samee3-adhkar-organized="yes"] main > div > section.relative.overflow-hidden .relative.z-10.grid > div:last-child {
              display: none !important;
            }
            [data-samee3-adhkar-organized="yes"] main > div > section.relative.overflow-hidden h2,
            [data-samee3-adhkar-organized="yes"] main > div > section.relative.overflow-hidden p {
              display: none !important;
            }
            [data-samee3-adhkar-organized="yes"] main > div > section.relative.overflow-hidden .mt-5 {
              margin-top: 9px !important;
            }
            [data-samee3-adhkar-organized="yes"] main > div > a[href="/adhkar/recordings"] {
              min-height: 64px !important;
              margin-bottom: 0 !important;
              padding: 12px 15px !important;
              border-radius: 18px !important;
            }
            [data-samee3-adhkar-organized="yes"] main > div > header {
              margin-bottom: 15px !important;
            }
            [data-samee3-adhkar-organized="yes"] main > div > section.mt-5.grid {
              margin-top: 16px !important;
            }
          `}</style>
        </>
      )}
    </div>
  )
}
