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
