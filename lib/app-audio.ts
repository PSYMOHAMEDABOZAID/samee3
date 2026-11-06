'use client'

import { useSyncExternalStore } from 'react'
import { createPersistentPlayer, type PlaybackTrack } from './persistent-player'
import { libraryAudioSource } from './audio-catalog'
import { resolveOfflineAudio } from './samee3-audio-offline'
import { cachedAdhkarPlaybackUrl } from './adhkar-offline'
import { bindQuranMediaSession } from './quran/media-session'
import { attachAudioContinuity } from './use-audio-continuity'

export const appAudio = createPersistentPlayer({
  createAudio() {
    const audio = new Audio()
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
    const source = libraryAudioSource(track.url)
    return { src: source.startsWith('/api/audio-proxy?') ? `${source}&stream=1` : source }
  },
  bind(audio, track: PlaybackTrack) {
    bindQuranMediaSession(audio, track.library || {
      kind: 'library', title: track.title, subtitle: track.subtitle,
      audioUrl: track.url, reciterName: track.subtitle,
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
