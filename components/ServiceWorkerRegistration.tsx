'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { APP_BUILD_ID } from '@/lib/app-version'

const SW_URL = '/sw.js'
const CURRENT_BUILD = APP_BUILD_ID
const CONSUMED_KEY = 'samee3_update_consumed_build_v2'
const CHECK_EVERY_MS = 10 * 60 * 1000
const MIN_CHECK_GAP_MS = 2 * 60 * 1000

type BuildResponse = { buildId?: unknown }

function consumedBuild(): string | null {
  try { return localStorage.getItem(CONSUMED_KEY) } catch { return null }
}
function rememberBuild(build: string) {
  try { localStorage.setItem(CONSUMED_KEY, build) } catch { /* Private browsing */ }
}
function reportUpdate(message: string) {
  window.dispatchEvent(new CustomEvent('samee3:update-status', { detail: message }))
}

/**
 * An update prompt represents a NEW DEPLOYED BUILD, not merely a changed sw.js.
 * Never clear Cache Storage or IndexedDB, which contain the user's saved audio.
 */
export default function ServiceWorkerRegistration() {
  const [target, setTarget] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const lastCheckRef = useRef(0)
  const pendingReloadRef = useRef(false)
  const checkingRef = useRef(false)
  const startedRef = useRef(false)

  const check = useCallback(async (manual = false) => {
    if (checkingRef.current || navigator.onLine === false ||
      (!manual && Date.now() - lastCheckRef.current < MIN_CHECK_GAP_MS)) {
      if (manual && navigator.onLine === false) reportUpdate('الاتصال بالإنترنت مطلوب لفحص التحديث.')
      return
    }
    checkingRef.current = true
    lastCheckRef.current = Date.now()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch('/api/app-version', {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Update check failed')
      const data = await response.json() as BuildResponse
      const newest = typeof data.buildId === 'string' ? data.buildId.trim() : ''
      if (!newest || CURRENT_BUILD === 'development' || newest === 'development' || newest === CURRENT_BUILD) {
        setTarget(null)
        if (manual) reportUpdate('أنت تستخدم أحدث إصدار من مصحف سميع.')
        return
      }
      // The user already accepted/dismissed this exact build. Do not display
      // the same update repeatedly if Safari serves an older page from cache.
      if (consumedBuild() === newest) {
        setTarget(null)
        if (manual) reportUpdate('تم التعامل مع هذا التحديث مسبقًا. أعد فتح التطبيق إذا لزم.')
        return
      }
      setTarget(newest)
      if (manual) reportUpdate('إصدار جديد متاح لمصحف سميع.')
    } catch {
      if (manual) reportUpdate('تعذّر فحص التحديث الآن؛ حاول لاحقًا.')
    } finally {
      window.clearTimeout(timeout)
      checkingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return
    const workers = navigator.serviceWorker
    let closed = false
    const onControllerChange = () => {
      if (!closed && pendingReloadRef.current) {
        pendingReloadRef.current = false
        window.location.reload()
      }
    }
    workers.addEventListener('controllerchange', onControllerChange)
    void workers.register(SW_URL, { scope: '/', updateViaCache: 'none' })
      .then(reg => {
        if (closed) return
        registrationRef.current = reg
        if (!startedRef.current) {
          startedRef.current = true
          void check()
        }
      })
      .catch(() => { if (!closed) void check() })

    // No once-a-minute worker popup. A changed service worker can be applied
    // silently, but only a changed deployed BUILD can show an update dialog.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const onManual = () => { void check(true) }
    const timer = window.setInterval(onVisible, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    window.addEventListener('samee3:check-update', onManual)
    return () => {
      closed = true
      window.clearInterval(timer)
      workers.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
      window.removeEventListener('samee3:check-update', onManual)
    }
  }, [check])

  const dismiss = () => {
    if (target) rememberBuild(target)
    setTarget(null)
  }
  const apply = () => {
    if (!target || applying) return
    rememberBuild(target)
    setTarget(null)
    setApplying(true)
    // Only reload as a direct result of the user's action. Never interrupt
    // playback merely because a newer deployment exists.
    const waiting = registrationRef.current?.waiting
    if (waiting) {
      pendingReloadRef.current = true
      waiting.postMessage({ type: 'SKIP_WAITING' })
      // Some iOS workers activate without a controllerchange notification.
      window.setTimeout(() => window.location.reload(), 2000)
    } else {
      window.location.reload()
    }
  }

  if (!target) return null
  return (
    <aside dir="rtl" role="status" aria-live="polite"
      className="fixed bottom-24 left-3 right-3 z-[120] mx-auto max-w-md rounded-2xl border border-[#dfc89d] bg-white p-4 text-[#12384a] shadow-[0_14px_45px_rgba(15,49,67,0.20)] sm:bottom-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f8f0df] text-[#b18a4a]">
          <RefreshCw size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">تحديث جديد لمصحف سميع</p>
          <p className="mt-1 text-xs leading-6 text-slate-600">
            إصدار جديد متاح. يمكنك تطبيقه عندما تنتهي من القراءة أو الاستماع.
            لن تُحذف التلاوات المحفوظة على الجهاز.
          </p>
        </div>
        <button type="button" onClick={dismiss} aria-label="تأجيل التحديث"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
      </div>
      <button type="button" onClick={apply} disabled={applying}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#145a72] px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
        <RefreshCw size={17} className={applying ? 'animate-spin' : ''} aria-hidden="true" />
        {applying ? 'جارٍ تطبيق التحديث…' : 'تحديث التطبيق الآن'}
      </button>
    </aside>
  )
}
