'use client'

import { useEffect } from 'react'
import {
  pageDataUrl,
  pageSvgUrl,
  readingMapUrl,
  MUSHAF_PAGE_CACHE,
} from '@/lib/quran/mushaf-cache'
import {
  inspectMushafDownloads,
  announceMushafDownloadsChanged,
} from '@/lib/quran/mushaf-downloads'
import { loadAdhkarCatalog } from '@/lib/adhkar-catalog'
import {
  HADITH_BOOKS,
  getHadithBooks,
  getHadithBook,
  getHadithChapter,
} from '@/lib/hadith-catalog'

/**
 * Prepares non-private reading sections and Hafs pages while the user is online.
 * Keeps the existing PWA caches, audio downloads, other riwayat and user data.
 * Web browsers can suspend downloads when the app is closed, so incomplete work
 * resumes on a later visit. No background audio or videos are downloaded.
 */

const PUBLIC_PAGES = [
  '/', '/mushaf', '/surahs', '/index', '/adhkar', '/adhkar/read',
  '/hadith', '/audio', '/prayer', '/islamic-library',
  '/offline', '/offline/manage', '/offline/test', '/notifications',
  '/notifications/hadith',
] as const
const PAGE_COUNT = 604
const LOCK_KEY = 'samee3:auto-hafs-lock-v1'
const LOCK_MAX_AGE_MS = 90_000
const MIN_FREE_BYTES = 20 * 1024 * 1024

const isPublic = (path: string): boolean =>
  PUBLIC_PAGES.some((route) => route === path) ||
  /^\/islamic-library\/(?:level|book)\//.test(path)

function cacheName(names: string[], type: 'navigation' | 'assets'): string | null {
  const pattern = new RegExp(`^samee3-sw-v(\\d+)-${type}$`)
  const matches = names
    .map((name) => ({ name, match: pattern.exec(name) }))
    .filter((entry) => entry.match !== null)
    .sort((a, b) => Number(b.match?.[1] || 0) - Number(a.match?.[1] || 0))
  return matches[0]?.name || null
}

function safeResponse(response: Response, expected: 'html' | 'asset'): boolean {
  if (!response.ok || response.redirected || response.type === 'opaque') return false
  if (response.headers.has('Set-Cookie')) return false
  if (/private|no-store/i.test(response.headers.get('Cache-Control') || '')) return false
  const type = (response.headers.get('Content-Type') || '').toLowerCase()
  if (expected === 'html') return type.includes('text/html')
  return !type.includes('text/html')
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function warmPublicSections(signal: AbortSignal): Promise<void> {
  const names = await caches.keys()
  const navName = cacheName(names, 'navigation')
  const assetsName = cacheName(names, 'assets')
  // The current service worker creates these caches during its installation.
  // Never invent a cache version the worker does not know about.
  if (!navName || !assetsName) return
  const nav = await caches.open(navName)
  const assets = await caches.open(assetsName)
  const assetUrls = new Set<string>()

  for (const path of PUBLIC_PAGES) {
    if (signal.aborted || !navigator.onLine) return
    try {
      const response = await fetch(path, {
        credentials: 'omit', cache: 'no-cache',
        headers: { Accept: 'text/html' }, signal,
      })
      if (!safeResponse(response, 'html')) continue
      if (new URL(response.url).pathname !== path) continue
      const html = await response.clone().text()
      await nav.put(new URL(path, location.origin).href, response)
      const found = html.match(/\/_next\/static\/[^"'<>\s]+/g) || []
      for (const part of found) {
        const normalized = part.replace(/&amp;/g, '&')
        const url = new URL(normalized, location.origin)
        if (url.origin === location.origin && url.pathname.startsWith('/_next/static/')) {
          assetUrls.add(url.href)
        }
      }
    } catch { /* One missing page must not prevent preparing the others. */ }
  }

  // Precaching the HTML alone does not work: the Next.js scripts and CSS
  // referenced by those pages must also be present without connectivity.
  const all = Array.from(assetUrls).slice(0, 320)
  let index = 0
  const worker = async () => {
    while (index < all.length && !signal.aborted && navigator.onLine) {
      const url = all[index++]
      try {
        if (await assets.match(url)) continue
        const response = await fetch(url, { credentials: 'omit', signal })
        if (safeResponse(response, 'asset')) await assets.put(url, response)
      } catch { /* Retry on the next online visit. */ }
    }
  }
  await Promise.all([worker(), worker(), worker()])
}

async function warmOfflineText(signal: AbortSignal): Promise<void> {
  if (signal.aborted || !navigator.onLine) return
  try { await loadAdhkarCatalog() } catch { /* Local JSON can also be used. */ }
  if (signal.aborted || !navigator.onLine) return
  try { await getHadithBooks() } catch { /* The built-in catalogue is retained. */ }
  // Cache actual contents for the first chapter in each collection. Remaining
  // hadith chapters continue to use the app's existing on-demand cache.
  for (const book of HADITH_BOOKS) {
    if (signal.aborted || !navigator.onLine) return
    try {
      const result = await getHadithBook(book.id)
      const first = result.chapters[0]
      if (first) await getHadithChapter(book.id, first.id)
    } catch { /* Do not block other sections. */ }
  }
}

function readLastPage(): number {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('samee3_persistent_reading_v2') || 'null')
    if (saved && typeof saved === 'object' && 'lastReadPage' in saved) {
      const value = Number(saved.lastReadPage)
      if (Number.isInteger(value) && value >= 1 && value <= PAGE_COUNT) return value
    }
  } catch { /* Start from Al-Fatiha when no reading progress exists. */ }
  return 1
}

async function hasSpace(): Promise<boolean> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate?.quota || estimate.usage === undefined) return true
    return estimate.quota - estimate.usage >= MIN_FREE_BYTES
  } catch { return true }
}

async function readHafsAsset(
  cache: Cache, url: string, category: 'page' | 'svg' | 'index', signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted || !navigator.onLine) return false
  if (await cache.match(url)) return true
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timer = window.setTimeout(abort, 18_000)
  try {
    const response = await fetch(url, {
      credentials: 'omit', cache: 'no-cache', signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok || response.type === 'opaque') return false
    if (!(response.headers.get('Content-Type') || '').toLowerCase().includes('json')) return false
    const body: unknown = await response.clone().json()
    if (!body || typeof body !== 'object') return false
    const data = body as Record<string, unknown>
    const nested = data.data && typeof data.data === 'object'
      ? data.data as Record<string, unknown> : null
    const valid = category === 'page'
      ? (Array.isArray(data.ayahs) && data.ayahs.length > 0) ||
        (Array.isArray(nested?.ayahs) && nested.ayahs.length > 0)
      : category === 'svg'
        ? data.success === true && typeof data.svg === 'string' && data.svg.length > 80
        : true
    if (!valid) {
      // An older SW may already have stored an invalid endpoint response.
      await cache.delete(url)
      return false
    }
    try { await cache.put(url, response) } catch { return false }
    return true
  } catch { return false }
  finally {
    window.clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

function acquireLock(token: string): boolean {
  try {
    const raw = localStorage.getItem(LOCK_KEY)
    if (raw) {
      const previous = JSON.parse(raw) as { token?: string; at?: number }
      if (previous?.token !== token && Date.now() - Number(previous?.at || 0) < LOCK_MAX_AGE_MS) {
        return false
      }
    }
    localStorage.setItem(LOCK_KEY, JSON.stringify({ token, at: Date.now() }))
    return JSON.parse(localStorage.getItem(LOCK_KEY) || '{}').token === token
  } catch { return true }
}
function refreshLock(token: string): void {
  try {
    const value = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}') as { token?: string }
    if (value.token === token) localStorage.setItem(LOCK_KEY, JSON.stringify({ token, at: Date.now() }))
  } catch { /* Storage may be blocked. */ }
}
function releaseLock(token: string): void {
  try {
    const value = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}') as { token?: string }
    if (value.token === token) localStorage.removeItem(LOCK_KEY)
  } catch { /* Another tab can resume after the lease expires. */ }
}

async function warmHafs(signal: AbortSignal): Promise<void> {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  if (!acquireLock(token)) return
  try {
    if (!(await hasSpace())) return
    try { void navigator.storage?.persist?.().catch(() => false) } catch {}
    const cache = await caches.open(MUSHAF_PAGE_CACHE)
    // The reading map is required by verse navigation and search.
    await readHafsAsset(cache, readingMapUrl('hafs'), 'index', signal)
    const summary = await inspectMushafDownloads()
    if (!summary.supported || signal.aborted) return
    const start = readLastPage()
    const queue = [start, ...Array.from({ length: PAGE_COUNT }, (_, i) => i + 1)]
      .filter((page, index, arr) => arr.indexOf(page) === index)
      .filter((page) => !summary.completed.hafs.has(page))

    let next = 0
    let failures = 0
    let processed = 0
    const work = async () => {
      while (next < queue.length && failures < 10 && !signal.aborted && navigator.onLine) {
        const page = queue[next++]
        if (++processed % 15 === 0 && !(await hasSpace())) break
        refreshLock(token)
        const dataOk = await readHafsAsset(cache, pageDataUrl('hafs', page), 'page', signal)
        if (!dataOk) { failures++; await delay(700, signal); continue }
        const svgOk = await readHafsAsset(cache, pageSvgUrl('hafs', page), 'svg', signal)
        if (!svgOk) { failures++; await delay(700, signal); continue }
        failures = 0
        if (processed % 15 === 0) announceMushafDownloadsChanged()
      }
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    await Promise.all(Array.from({ length: ios ? 2 : 3 }, () => work()))
    announceMushafDownloadsChanged()
  } finally { releaseLock(token) }
}

export default function OfflineBootstrap() {
  useEffect(() => {
    if (!('caches' in window) || !('serviceWorker' in navigator) || !window.isSecureContext) return
    let disposed = false
    let running = false
    let pending = false
    let controller: AbortController | null = null
    const start = async () => {
      if (disposed || running || !navigator.onLine) return
      running = true
      controller = new AbortController()
      const signal = controller.signal
      try {
        // The SW registration component installs/updates the existing worker.
        // This component never unregisters it or clears any caches.
        await delay(1800, signal)
        if (signal.aborted || !navigator.onLine) return
        // Independent tasks: prepare the app pages, Quran and local reading
        // catalogues together, so no section is blocked by the 604-page job.
        await Promise.allSettled([
          warmPublicSections(signal),
          warmHafs(signal),
          warmOfflineText(signal),
        ])
      } catch (error) {
        console.warn('SAMEE3: offline preparation will resume on the next visit.', error)
      } finally {
        running = false
        if (!disposed && pending && navigator.onLine) {
          pending = false
          void start()
        }
      }
    }
    const onOffline = () => controller?.abort()
    const onOnline = () => {
      if (running) pending = true
      else void start()
    }
    const onControllerChange = () => {
      // On first install the SW may finish after the initial cache scan.
      if (running) pending = true
      else void start()
    }
    const onClick = (event: MouseEvent) => {
      if (navigator.onLine || event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest<HTMLAnchorElement>('a[href]')
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return
      let url: URL
      try { url = new URL(link.href) } catch { return }
      if (url.origin !== location.origin || !isPublic(url.pathname)) return
      // App Router RSC prefetch URLs are not guaranteed to exist offline;
      // a full document navigation uses the already-cached public HTML.
      event.preventDefault()
      event.stopPropagation()
      location.assign(url.href)
    }
    const timer = window.setTimeout(() => { void start() }, 350)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    document.addEventListener('click', onClick, true)
    return () => {
      disposed = true
      controller?.abort()
      window.clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('click', onClick, true)
    }
  }, [])
  return null
}