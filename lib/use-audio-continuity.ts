'use client'

import { useEffect, type RefObject } from 'react'

const POSITION_KEY = 'samee3_audio_position_v2'
const MAX_RETRIES = 3

export function attachAudioContinuity(
  audio: HTMLAudioElement,
  notify: (message: string) => void
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let attempts = 0
  let wanted = !audio.paused && !audio.ended
  let restoring = false
  let recovering = false
  let previous = ''
  let resume = 0
  let lastSave = 0
  let recoveryTime = 0
  let lastPosition = 0
  let serial = 0

  const source = () => {
    const value = audio.getAttribute('src')
    if (!value) return ''

    try {
      const url = new URL(value, location.href)
      url.searchParams.delete('_retry')
      return url.href
    } catch {
      return ''
    }
  }

  const stopTimer = () => {
    clearTimeout(timer)
    timer = undefined
  }

  const save = () => {
    const url = source()
    const time = restoring ? resume : audio.currentTime

    if (
      !url ||
      url.startsWith('blob:') ||
      !Number.isFinite(time) ||
      time < 1
    ) {
      return
    }

    try {
      localStorage.setItem(
        POSITION_KEY,
        JSON.stringify({ url, time, at: Date.now() })
      )
    } catch {}
  }

  const savedPosition = (url: string) => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(POSITION_KEY) || 'null'
      )

      if (!saved || typeof saved !== 'object') return 0

      const row = saved as {
        url?: unknown
        time?: unknown
        at?: unknown
      }

      if (
        row.url === url &&
        typeof row.time === 'number' &&
        Number.isFinite(row.time) &&
        typeof row.at === 'number' &&
        Date.now() - row.at >= 0 &&
        Date.now() - row.at < 86400000
      ) {
        return Math.max(0, row.time)
      }
    } catch {}

    return 0
  }

  const schedule = (delay: number) => {
    // SAMEE3_AUDIO_LIBRARY_STABLE_V1: do not schedule retries while the page is hidden and paused.
    if (
      !disposed &&
      wanted &&
      !timer &&
      navigator.onLine !== false &&
      !(document.visibilityState === 'hidden' && audio.paused)
    ) {
      timer = setTimeout(recover, delay)
    }
  }

  const fail = (message: string) => {
    wanted = false
    restoring = false
    recovering = false
    stopTimer()
    notify(message)
  }

  function recover() {
    timer = undefined
    const url = source()

    if (
      disposed ||
      !wanted ||
      audio.ended ||
      !url ||
      navigator.onLine === false
    ) {
      return
    }

    if (url.startsWith('blob:')) {
      fail(
        'تعذر قراءة النسخة المحفوظة. أعد حفظ هذا التسجيل أثناء الاتصال.'
      )
      return
    }

    if (attempts >= MAX_RETRIES) {
      fail(
        'المصدر لا يستجيب. اضغط تشغيل لإعادة المحاولة من نفس الموضع.'
      )
      return
    }

    if (
      !restoring &&
      Number.isFinite(audio.currentTime) &&
      audio.currentTime > 0
    ) {
      resume = audio.currentTime
    }

    save()
    attempts += 1
    restoring = true
    recovering = true
    recoveryTime = Date.now()
    serial += 1

    const rate = audio.playbackRate

    try {
      const next = new URL(url)

      if (
        next.origin === location.origin &&
        next.pathname === '/api/audio-proxy'
      ) {
        next.searchParams.set('_retry', String(Date.now()))
      }

      audio.src = next.href
      audio.load()
      audio.playbackRate = rate
      schedule(15000)
    } catch {
      fail(
        'تعذر استكمال التسجيل. اضغط تشغيل للمحاولة مجددًا.'
      )
    }
  }

  const restore = () => {
    if (disposed) return

    if (
      resume > 0 &&
      audio.readyState >= 1 &&
      Number.isFinite(audio.duration)
    ) {
      if (resume < audio.duration - 2) {
        try {
          audio.currentTime = resume
        } catch {
          return
        }
      }

      resume = 0
    }

    if (!restoring || !wanted) return

    const request = serial
    const url = source()

    void audio.play().catch((error: unknown) => {
      if (
        disposed ||
        request !== serial ||
        source() !== url ||
        !wanted
      ) {
        return
      }

      if (
        error instanceof DOMException &&
        error.name === 'AbortError'
      ) {
        return
      }

      fail('اضغط تشغيل لاستكمال الصوت من نفس الموضع.')
    })
  }

  const load = () => {
    const current = source()
    if (current === previous) return

    serial += 1
    previous = current
    attempts = 0
    restoring = false
    recovering = false
    resume = current ? savedPosition(current) : 0
    lastPosition = 0
    stopTimer()

    if (!current) wanted = false
  }

  const play = () => {
    wanted = true

    // التشغيل الناتج عن الاستعادة لا يبدأ عداد المحاولات من الصفر.
    if (!recovering) attempts = 0
  }

  const playing = () => {
    wanted = true
    restoring = false
    lastPosition = audio.currentTime
    stopTimer()
  }

  const pause = () => {
    if (restoring || audio.error) return

    // SAMEE3_STABILITY_20261107: distinguish interruptions from user pauses.
    const explicit = (
      audio as HTMLAudioElement & {
        __samee3ExplicitPause?: boolean
      }
    ).__samee3ExplicitPause === true

    if (
      document.visibilityState === 'hidden' &&
      wanted &&
      !explicit &&
      !audio.ended
    ) {
      save()
      return
    }

    wanted = false
    serial += 1
    stopTimer()
    save()
  }

  const waiting = () => schedule(15000)

  const progress = () => {
    if (
      !audio.paused &&
      audio.currentTime > lastPosition + 0.05
    ) {
      lastPosition = audio.currentTime
      stopTimer()

      if (
        recovering &&
        Date.now() - recoveryTime >= 30000
      ) {
        recovering = false
        attempts = 0
      }
    }

    if (Date.now() - lastSave > 5000) {
      lastSave = Date.now()
      save()
    }
  }

  const error = () => {
    if (!source()) return

    if (audio.error?.code === 2) {
      stopTimer()

      if (wanted) {
        schedule(1000 * (attempts + 1))
      }
    } else {
      fail(
        'تعذر تشغيل صيغة هذا الملف أو لم يعد متاحًا لدى المصدر.'
      )
    }
  }

  const manualRetry = () => {
    if (!source()) return

    stopTimer()
    attempts = 0
    wanted = true

    if (navigator.onLine === false) {
      notify(
        'اتصل بالإنترنت لاستكمال التسجيل غير المحفوظ.'
      )
      return
    }

    recover()
  }

  const visibility = () => {
    if (document.visibilityState !== 'visible') {
      save()
      return
    }

    if (
      !wanted ||
      disposed ||
      audio.ended ||
      !audio.paused ||
      !source()
    ) return

    // Recovery can still require user interaction on iOS.
    void audio.play().catch(() =>
      notify('اضغط تشغيل لاستكمال الصوت بعد العودة للتطبيق.')
    )
  }

  const online = () => schedule(500)

  const offline = () => {
    save()
    stopTimer()
  }

  const ended = () => {
    wanted = false
    restoring = false
    recovering = false
    stopTimer()

    try {
      localStorage.removeItem(POSITION_KEY)
    } catch {}
  }

  const events: Record<string, EventListener> = {
    loadstart: load,
    emptied: () => {
      if (!source()) load()
    },
    loadedmetadata: restore,
    canplay: () => {
      if (restoring) restore()
    },
    play,
    playing,
    pause,
    waiting,
    stalled: waiting,
    timeupdate: progress,
    error,
    ended,
    'samee3-audio-retry': manualRetry,
  }

  load()

  for (const [name, listener] of Object.entries(events)) {
    audio.addEventListener(name, listener)
  }

  window.addEventListener('online', online)
  window.addEventListener('offline', offline)
  window.addEventListener('pagehide', save)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pageshow', visibility)

  return () => {
    save()
    disposed = true
    serial += 1
    stopTimer()

    for (const [name, listener] of Object.entries(events)) {
      audio.removeEventListener(name, listener)
    }

    window.removeEventListener('online', online)
    window.removeEventListener('offline', offline)
    window.removeEventListener('pagehide', save)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('pageshow', visibility)
  }
}

export function useAudioContinuity(
  ref: RefObject<HTMLAudioElement | null>,
  notify: (message: string) => void
) {
  useEffect(() => {
    const audio = ref.current

    if (audio) {
      return attachAudioContinuity(audio, notify)
    }
  }, [ref, notify])
}