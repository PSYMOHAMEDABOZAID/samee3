/** Playback belongs to the application, so route unmounts only detach views. */
import type { AdhkarMedia } from './adhkar-media'
export type LibraryPlayerItem = {
  kind: 'quran' | 'library'; title: string; subtitle: string; audioUrl: string; reciterName: string
  surahId?: number; reciterId?: number; riwayaId?: number; moshafId?: number
  libraryId?: string; sourceName?: string; isStream?: boolean; legacyOpaque?: boolean
}
export type PlaybackTrack = {
  url: string; title: string; subtitle: string; library?: LibraryPlayerItem
  itemId?: number; repetitions?: number; repeatRemaining?: boolean
  listenRepeats?: number
  editionId?: string; surah?: number; savedUrl?: string
  adhkar?: AdhkarMedia
}
export type PlaybackState = {
  scope: 'library' | 'adhkar' | 'riwayat' | null; contextKey: string; href: string; readerId: string
  queue: PlaybackTrack[]; index: number; playing: boolean; loading: boolean
  position: number; duration: number; rate: number; volume: number; muted: boolean
  repeat: 'off' | 'one' | 'all'; error: string; counts: Record<number, number>
  playCount: number; playTarget: number
}
export type PlaybackStart = Pick<PlaybackState, 'scope' | 'queue' | 'index' | 'href'> & {
  contextKey?: string; readerId?: string; counts?: Record<number, number>; daily?: boolean; autoplay?: boolean
  repeat?: PlaybackState['repeat']
}
type Resolved = { src: string; position?: number; release?: () => void }
type Dependencies = {
  createAudio: () => HTMLAudioElement
  resolve: (track: PlaybackTrack, scope: PlaybackState['scope']) => Resolved | Promise<Resolved>
  bind?: (audio: HTMLAudioElement, track: PlaybackTrack) => void
  saveCounts?: (key: string, counts: Record<number, number>) => void
  day?: () => string
}
const INITIAL: PlaybackState = {
  scope: null, contextKey: '', href: '', readerId: '', queue: [], index: -1, playing: false,
  loading: false, position: 0, duration: 0, rate: 1, volume: 1, muted: false,
  repeat: 'off', error: '', counts: {}, playCount: 0, playTarget: 0,
}

export function createPersistentPlayer(deps: Dependencies) {
  let state = INITIAL
  let audio: HTMLAudioElement | null = null
  let serial = 0, wanted = false, switching = false
  let release: (() => void) | undefined
  let daily = false, startedDay = ''
  let pendingSeek = 0
  const listeners = new Set<() => void>()
  const update = (patch: Partial<PlaybackState>) => {
    state = { ...state, ...patch }
    listeners.forEach(listener => listener())
  }
  const current = () => state.queue[state.index]
  const persistCounts = () => {
    if (state.contextKey) deps.saveCounts?.(state.contextKey, state.counts)
  }
  const fail = (message: string) => {
    wanted = false
    update({ playing: false, loading: false, error: message })
  }
  const play = (request: number) => {
    if (!audio || request !== serial || !wanted) return
    try {
      // SAMEE3_STABILITY_20261107: preserve playback intent.
      ;(audio as HTMLAudioElement & {
        __samee3ExplicitPause?: boolean
      }).__samee3ExplicitPause = false
      const result = audio.play()
      void result?.catch((error: unknown) => {
        if (request !== serial || !wanted) return
        if (error instanceof Error && error.name === 'AbortError') return
        fail('تعذر بدء الصوت. اضغط تشغيل للاستكمال أو أعد المحاولة عند عودة الاتصال.')
      })
    } catch { fail('تعذر بدء الصوت. اضغط تشغيل للاستكمال.') }
  }
  const ensure = () => {
    if (audio) return audio
    audio = deps.createAudio()
    audio.preload = 'metadata'
    audio.addEventListener('playing', () => { wanted = true; update({ playing: true, loading: false, error: '' }) })
    audio.addEventListener('play', () => { wanted = true; update({ playing: true }) })
    audio.addEventListener('pause', () => {
      const explicitlyPaused = (
        audio as HTMLAudioElement & {
          __samee3ExplicitPause?: boolean
        }
      ).__samee3ExplicitPause === true

      // SAMEE3_STABILITY_20261107: retain intent on background interruptions.
      if (
        !switching &&
        !(
          document.visibilityState === 'hidden' &&
          wanted &&
          !explicitlyPaused &&
          !audio?.ended
        )
      ) wanted = false

      update({
        playing: false,
        ...(!switching ? { loading: false } : {}),
      })
    })
    audio.addEventListener('waiting', () => { if (wanted) update({ loading: true }) })
    audio.addEventListener('loadedmetadata', () => {
      if (pendingSeek > 0 && Number.isFinite(audio!.duration) && pendingSeek < audio!.duration - 2) {
        try { audio!.currentTime = pendingSeek } catch { /* metadata not seekable yet */ }
      }
      pendingSeek = 0
      update({ duration: Number.isFinite(audio!.duration) ? audio!.duration : 0 })
    })
    audio.addEventListener('timeupdate', () => {
      const position = audio!.currentTime || 0
      if (Math.floor(position / 2) !== Math.floor(state.position / 2)) update({ position })
    })
    audio.addEventListener('error', () => {
      if (switching || !audio?.getAttribute('src')) return

      // SAMEE3_STABILITY_20261107: allow recovery on temporary network failures.
      if (
        audio.error?.code === 2 &&
        navigator.onLine !== false
      ) {
        update({ loading: true, error: '' })
        return
      }

      fail('تعذر تشغيل التسجيل. تحقق من الاتصال أو من حفظه كاملًا على الجهاز.')
    })
    audio.addEventListener('ended', () => {
      if (switching || !current() || !audio?.getAttribute('src')) return
      wanted = false
      if (daily && startedDay !== deps.day?.()) {
        fail('بدأ يوم جديد. افتح الأذكار لبدء ورد اليوم.')
        return
      }
      const track = current()
      update({ playCount: state.playCount + 1 })
      if (track?.itemId !== undefined) {
        const before = state.counts[track.itemId] ?? track.repetitions ?? 1
        const remaining = Math.max(0, before - 1)
        if (before > 0) {
          update({ counts: { ...state.counts, [track.itemId]: remaining } })
          persistCounts()
        }
        if (track.listenRepeats === undefined && remaining > 0 && track.repeatRemaining !== false) { replay(); return }
      }
      if (track?.listenRepeats !== undefined && state.playCount < state.playTarget) { replay(); return }
      if (state.repeat === 'one') { replay(); return }
      if (state.index + 1 < state.queue.length) { void playAt(state.index + 1); return }
      if (state.repeat === 'all' && state.queue.length) { void playAt(0); return }
      update({ playing: false, loading: false, position: 0 })
    })
    return audio
  }
  function replay() {
    if (!audio) return
    try { audio.currentTime = 0 } catch { playAt(state.index); return }
    wanted = true
    update({ position: 0, loading: true, error: '' })
    play(++serial)
  }
  function playAt(index: number, autoplay = true) {
    if (!Number.isInteger(index) || index < 0 || index >= state.queue.length) {
      wanted = false; update({ playing: false, loading: false }); return
    }
    while (index < state.queue.length && state.queue[index].itemId !== undefined &&
      state.queue[index].listenRepeats === undefined && state.counts[state.queue[index].itemId!] === 0) index++
    const track = state.queue[index]
    if (!track) { wanted = false; update({ playing: false, loading: false }); return }
    const element = ensure()
    const request = ++serial
    switching = true
    wanted = autoplay
    element.pause()
    element.removeAttribute('src')
    element.load()
    release?.(); release = undefined
    const fixed = Number(track.listenRepeats)
    const playTarget = track.listenRepeats !== undefined
      ? Number.isSafeInteger(fixed) ? Math.min(1000, Math.max(1, fixed)) : 1
      : track.itemId !== undefined && track.repeatRemaining !== false
        ? Math.max(1, state.counts[track.itemId] ?? track.repetitions ?? 1) : 1
    update({ index, playing: false, loading: autoplay, position: 0, duration: 0, error: '', playCount: 0, playTarget })
    const apply = (resolved: Resolved) => {
      if (request !== serial) { resolved.release?.(); return }
      release = resolved.release
      pendingSeek = resolved.position || 0
      element.src = resolved.src
      element.playbackRate = state.rate
      element.volume = state.volume
      element.muted = state.muted
      deps.bind?.(element, track)
      switching = false
      // Start during the click, before cache lookups or a canplay callback can
      // lose the user gesture on Safari. play() itself waits for media data.
      if (autoplay) play(request)
      else element.load()
    }
    try {
      const result = deps.resolve(track, state.scope)
      if (result instanceof Promise) {
        void result.then(apply).catch((error: unknown) => {
          if (request !== serial) return
          switching = false
          fail(error instanceof Error ? error.message : 'تعذر تجهيز الصوت المحفوظ.')
        })
      } else apply(result)
    } catch (error) {
      switching = false
      fail(error instanceof Error ? error.message : 'تعذر تجهيز الصوت.')
    }
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => INITIAL,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    element: () => audio,
    start(options: PlaybackStart) {
      daily = options.daily === true; startedDay = deps.day?.() || ''
      const repeat = options.repeat ?? (state.scope === options.scope ? state.repeat : 'off')
      update({ scope: options.scope, contextKey: options.contextKey || '', href: options.href, readerId: options.readerId || '',
        queue: options.queue, counts: options.counts || {}, repeat })
      playAt(options.index, options.autoplay !== false)
    },
    stop(scope?: PlaybackState['scope']) {
      if (scope && state.scope !== scope) return
      ++serial
      wanted = false
      switching = true

      if (audio) {
        (audio as HTMLAudioElement & {
          __samee3ExplicitPause?: boolean
        }).__samee3ExplicitPause = true
      }

      audio?.pause()
      audio?.removeAttribute('src')
      audio?.load()
      release?.(); release = undefined; switching = false
      update({ ...INITIAL, rate: state.rate, volume: state.volume, muted: state.muted })
    },
    toggle() {
      if (!audio || !current()) return
      if (daily && startedDay !== deps.day?.()) { audio.pause(); fail('بدأ يوم جديد. افتح الأذكار لبدء ورد اليوم.'); return }
      if (state.loading || state.playing) {
        (audio as HTMLAudioElement & {
          __samee3ExplicitPause?: boolean
        }).__samee3ExplicitPause = true

        wanted = false
        ++serial
        switching = false
        audio.pause()

        update({ playing: false, loading: false })
        return
      }
      wanted = true
      update({ loading: true, error: '' })
      if (audio.error || !audio.getAttribute('src') || (audio.ended && current()?.listenRepeats !== undefined)) playAt(state.index)
      else { ++serial; play(serial) }
    },
    next(offset: number) {
      let index = state.index + offset
      if (state.repeat === 'all' && state.queue.length) index = (index + state.queue.length) % state.queue.length
      if (index >= 0 && index < state.queue.length) playAt(index)
    },
    seek(value: number) {
      if (!audio || !Number.isFinite(value) || !Number.isFinite(audio.duration) || audio.duration <= 0) return
      audio.currentTime = Math.max(0, Math.min(audio.duration, value)); update({ position: audio.currentTime })
    },
    settings(patch: Partial<Pick<PlaybackState, 'rate' | 'volume' | 'muted' | 'repeat'>>) {
      update(patch)
      if (audio) { audio.playbackRate = state.rate; audio.volume = state.volume; audio.muted = state.muted }
    },
    setCounts(key: string, counts: Record<number, number>) {
      if (state.scope === 'adhkar' && state.contextKey === key) { update({ counts }); persistCounts() }
    },
    report: fail,
  }
}
