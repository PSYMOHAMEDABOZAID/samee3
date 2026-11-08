'use client'

import { useSyncExternalStore } from 'react'
import { createPersistentPlayer, type PlaybackTrack } from './persistent-player'
import { libraryAudioSource } from './audio-catalog'
import { directLibraryStreamingUrl, isAlafasyTrack } from './samee3-usage-optimizer'
import { resolveOfflineAudio } from './samee3-audio-offline'
import { cachedAdhkarPlaybackUrl } from './adhkar-offline'
import { bindQuranMediaSession } from './quran/media-session'
import { attachAudioContinuity } from './use-audio-continuity'

export const appAudio = createPersistentPlayer({
  createAudio() {
    const audio = new Audio()

    // SAMEE3_ORIGIN_TRANSFER: public Quran TV/Assabile files are played directly.
    // If hotlink protection rejects playback, fall back to the original,
    // allowlisted proxy. Install this BEFORE the standard error handlers.
    audio.addEventListener('error', event => {
      const state = appAudio.getSnapshot()
      if (state.scope !== 'library') return
      const track = state.queue[state.index]
      if (!track || isAlafasyTrack(track)) return
      const direct = directLibraryStreamingUrl(track.url)
      if (!direct) return
      const current = audio.currentSrc || audio.src
      if (current !== direct && audio.src !== direct) return
      const originalProxy = libraryAudioSource(track.url)
      if (!originalProxy.startsWith('/api/audio-proxy?')) return

      // The first direct attempt failed. Do not let continuity handlers treat
      // this recoverable error as a terminal playback error.
      event.stopImmediatePropagation()
      const shouldResume = state.playing || state.loading || !audio.paused
      const resumeAt = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
      try {
        audio.src = `${originalProxy}&stream=1`
        if (resumeAt > 0) {
          audio.addEventListener('loadedmetadata', () => {
            if (Number.isFinite(audio.duration) && resumeAt < audio.duration - 1) {
              try { audio.currentTime = resumeAt } catch { /* source may not seek */ }
            }
          }, { once: true })
        }
        audio.load()
        if (shouldResume) {
          void audio.play().catch(() => {
            appAudio.report('تعذر تشغيل التسجيل مباشرة. اضغط تشغيل للمحاولة عبر المصدر الاحتياطي.')
          })
        }
      } catch {
        appAudio.report('تعذر التحويل إلى مصدر الصوت الاحتياطي.')
      }
    })

    // Keep ordinary Quran/library/adhkar audio mutually exclusive, while
    // leaving Alafasy's riwayat player behavior unchanged.
    let interruptedWhileHidden = false
    audio.addEventListener('play', () => {
      interruptedWhileHidden = false
      const current = appAudio.getSnapshot()
      if (current.scope !== 'library' && current.scope !== 'adhkar') return
      const quran = (window as Window & {
        __samee3PersistentAudio?: HTMLAudioElement & {
          __samee3Continue?: boolean; __samee3Serial?: number; __samee3Switching?: boolean
        }
      }).__samee3PersistentAudio
      if (quran && !quran.paused) {
        quran.__samee3Continue = false
        quran.__samee3Switching = false
        quran.__samee3Serial = Number(quran.__samee3Serial || 0) + 1
        quran.pause()
      }
    })
    audio.addEventListener('pause', () => {
      const current = appAudio.getSnapshot()
      if ((current.scope !== 'library' && current.scope !== 'adhkar') ||
        audio.ended || document.visibilityState !== 'hidden') return
      const explicitlyPaused = (audio as HTMLAudioElement & {
        __samee3ExplicitPause?: boolean
      }).__samee3ExplicitPause === true
      if (!explicitlyPaused && (current.playing || current.loading)) {
        interruptedWhileHidden = true
      }
    })
    const resumeOnReturn = () => {
      if (!interruptedWhileHidden || document.visibilityState !== 'visible') return
      const current = appAudio.getSnapshot()
      if ((current.scope !== 'library' && current.scope !== 'adhkar') ||
        !audio.paused || audio.ended || !audio.getAttribute('src')) {
        interruptedWhileHidden = false
        return
      }
      interruptedWhileHidden = false
      // This may be blocked by iOS without a fresh user gesture; the player
      // then remains visible with a manual Play button.
      void audio.play().catch(() => {
        appAudio.report('اضغط تشغيل لاستكمال الصوت بعد العودة للتطبيق.')
      })
    }
    document.addEventListener('visibilitychange', resumeOnReturn)
    window.addEventListener('pageshow', resumeOnReturn)

    // End-of-track counting and auto-next are owned exclusively by
    // createPersistentPlayer. The old 1.6-second fallback could SKIP a dhikr
    // still awaiting its remaining repetitions when Safari blocked replay.
    // Never advance a second time from this adapter.

    attachAudioContinuity(audio, message => appAudio.report(message))
    let lastSaved = -1
    audio.addEventListener('timeupdate', () => {
      const state = appAudio.getSnapshot(), track = state.queue[state.index]
      if (state.scope !== 'riwayat' || !track || Math.floor(audio.currentTime / 5) === lastSaved) return
      lastSaved = Math.floor(audio.currentTime / 5)
      try { localStorage.setItem('samee3-alafasy-playback-v2', JSON.stringify({ editionId: track.editionId, surah: track.surah, seconds: audio.currentTime })) } catch {}
    })
    return audio
  },
  resolve(track, scope) {
    if (scope === 'riwayat') {
      let position = 0
      try {
        const previous = JSON.parse(localStorage.getItem('samee3-alafasy-playback-v2') || 'null')
        if (previous?.editionId === track.editionId && previous.surah === track.surah && Number.isFinite(previous.seconds)) position = Math.max(0, previous.seconds)
      } catch {}
      if (navigator.onLine !== false) return { src: track.url, position }
      if (navigator.serviceWorker?.controller && track.savedUrl) return { src: track.savedUrl, position }
      return (async () => {
        const response = track.savedUrl ? await (await caches.open('samee3-riwayat-audio-v1')).match(track.savedUrl) : null
        if (!response || response.status !== 200) throw new Error('السورة غير محفوظة على هذا الجهاز. حمّلها أثناء الاتصال.')
        const blob = await response.blob(), src = URL.createObjectURL(blob)
        return { src, position, release: () => URL.revokeObjectURL(src) }
      })()
    }
    if (scope === 'adhkar') {
      if (navigator.serviceWorker?.controller || navigator.onLine !== false) return { src: track.url }
      return cachedAdhkarPlaybackUrl(track.url).then(src => {
        if (!src) throw new Error('التسجيل غير محفوظ على هذا الجهاز. نزّله أثناء الاتصال أولًا.')
        return { src, release: src.startsWith('blob:') ? () => URL.revokeObjectURL(src) : undefined }
      })
    }
    const item = track.library
    const key = item?.kind === 'quran'
      ? `quran:${item.reciterId}:${item.riwayaId}:${item.surahId}` : `library:${item?.libraryId}`
    if (navigator.onLine === false || !track.url) {
      if (navigator.serviceWorker?.controller) return { src: `/__samee3_library_offline?url=${encodeURIComponent(track.url)}&key=${encodeURIComponent(key)}` }
      return resolveOfflineAudio({ url: track.url, key, kind: item?.kind }).then(saved => {
        if (!saved) throw new Error('هذا التسجيل غير محفوظ كاملًا. اتصل بالإنترنت واحفظه أولًا.')
        return { src: saved.src, release: saved.objectUrl ? () => URL.revokeObjectURL(saved.objectUrl!) : undefined }
      })
    }
    // Never touch the Alafasy collected Quran or any Alafasy library tracks.
    const direct = !isAlafasyTrack(track) ? directLibraryStreamingUrl(track.url) : null
    if (direct) return { src: direct }
    const source = libraryAudioSource(track.url)
    return { src: source.startsWith('/api/audio-proxy?') ? `${source}&stream=1` : source }
  },
  bind(audio, track: PlaybackTrack) {
    if (appAudio.getSnapshot().scope === 'adhkar') {
      bindQuranMediaSession(audio, {
        kind: 'adhkar', title: track.title, subtitle: track.adhkar?.section || track.title,
        audioUrl: track.url, reciterName: track.subtitle, adhkar: track.adhkar,
        next: appAudio.getSnapshot().queue.length > 1 ? () => appAudio.next(1) : undefined,
        previous: appAudio.getSnapshot().queue.length > 1 ? () => appAudio.next(-1) : undefined,
        play: () => { const state = appAudio.getSnapshot(); if (!state.playing && !state.loading) appAudio.toggle() },
        pause: () => { const state = appAudio.getSnapshot(); if (state.playing || state.loading) appAudio.toggle() },
      })
      return
    }
    // SAMEE3_STABILITY_20261107: expose queue controls on lock screen for all audio.
    const state = appAudio.getSnapshot()
    const controls = {
      next: state.queue.length > 1
        ? () => appAudio.next(1)
        : undefined,
      previous: state.queue.length > 1
        ? () => appAudio.next(-1)
        : undefined,
      play: () => {
        if (
          appAudio.element()?.paused &&
          !appAudio.getSnapshot().loading
        ) appAudio.toggle()
      },
      pause: () => {
        if (
          !appAudio.element()?.paused ||
          appAudio.getSnapshot().loading
        ) appAudio.toggle()
      },
    }
    bindQuranMediaSession(audio, {
      ...(track.library || {
        kind: 'library' as const,
        title: track.title,
        subtitle: track.subtitle,
        audioUrl: track.url,
        reciterName: track.subtitle,
      }),
      ...controls,
    })
  },
  saveCounts(key, counts) {
    try { localStorage.setItem(key, JSON.stringify({ counts, savedAt: Date.now() })) } catch { /* optional persistence */ }
  },
  day() { const date = new Date(); return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` },
})

export function useAppAudio() {
  return useSyncExternalStore(appAudio.subscribe, appAudio.getSnapshot, appAudio.getServerSnapshot)
}
