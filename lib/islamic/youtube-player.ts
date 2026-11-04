export type StudyPlayer = {
  getPlaylist: () => string[] | null
  getPlaylistIndex: () => number
  getCurrentTime: () => number
  getIframe: () => HTMLIFrameElement
  getVideoUrl: () => string
  playVideoAt: (index: number) => void
  cuePlaylist: (
    value: string[] | { list: string; listType: string; index: number; startSeconds: number },
    index?: number,
    seconds?: number,
  ) => void
  cueVideoById: (value: { videoId: string; startSeconds?: number }) => void
  loadVideoById: (value: { videoId: string; startSeconds?: number }) => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  setVolume: (volume: number) => void
  getDuration: () => number
  getPlayerState: () => number
  setPlaybackRate: (rate: number) => void
  getPlaybackRate: () => number
  getAvailablePlaybackRates: () => number[]
  destroy: () => void
}
export type YoutubeAPI = {
  Player: new (
    element: HTMLElement,
    options: {
      width: string
      height: string
      host: string
      playerVars: Record<string, string | number>
      events: {
        onReady: (event: { target: StudyPlayer }) => void
        onStateChange: (event: { target: StudyPlayer; data: number }) => void
        onError: (event: { data: number }) => void
      }
    },
  ) => StudyPlayer
}
let loading: Promise<YoutubeAPI> | null = null
export function youtubeSource(value: unknown): { list?: string; video?: string } | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value),
      host = url.hostname.replace(/^www\./, '')
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      !['youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)
    )
      return null
    const list = url.searchParams.get('list'),
      video =
        host === 'youtu.be'
          ? url.pathname.slice(1)
          : url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})/)?.[1]
    // A watch URL identifies a lesson even when copied from a playlist.
    if (video && /^[\w-]{11}$/.test(video)) return { video }
    if (list && /^[\w-]{10,80}$/.test(list)) return { list }
    return video && /^[\w-]{11}$/.test(video) ? { video } : null
  } catch {
    return null
  }
}
export function youtubeError(code: number) {
  if (code === 100) return 'الدرس محذوف أو خاص لدى الناشر. اختر درسًا آخر.'
  if (code === 101 || code === 150) return 'الناشر يمنع تشغيل هذا الدرس داخل التطبيقات. افتحه من زر YouTube.'
  if (code === 153)
    return 'YouTube لم يستقبل تعريف الموقع. افتح التطبيق في Safari أو Chrome ثم أعد المحاولة، أو افتح الدرس من زر YouTube.'
  if (code === 2) return 'رابط الدرس غير صالح لدى YouTube.'
  if (code === 5) return 'المتصفح لم يستطع تشغيل الفيديو. أعد المحاولة أو افتحه في YouTube.'
  return 'تعذر الاتصال بـ YouTube. تحقق من الاتصال ثم أعد المحاولة.'
}
export function loadYoutubePlayer(): Promise<YoutubeAPI> {
  const win = window as Window & { YT?: YoutubeAPI; onYouTubeIframeAPIReady?: () => void }
  if (win.YT?.Player) return Promise.resolve(win.YT)
  if (loading) return loading
  loading = new Promise<YoutubeAPI>((resolve, reject) => {
    document.getElementById('samee3-youtube-api')?.remove()
    const previous = win.onYouTubeIframeAPIReady
    const script = document.createElement('script')
    script.id = 'samee3-youtube-api'
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    let done = false
    const cleanup = () => {
      clearTimeout(timer)
      clearInterval(poll)
      script.onerror = null
      if (win.onYouTubeIframeAPIReady === ready) win.onYouTubeIframeAPIReady = previous || (() => {})
    }
    const ready = () => {
      if (done || !win.YT?.Player) return
      done = true
      cleanup()
      resolve(win.YT)
      try {
        previous?.()
      } catch {}
    }
    const fail = () => {
      if (done) return
      done = true
      cleanup()
      script.remove()
      loading = null
      reject(new Error('تعذر تحميل مشغل YouTube. تحقق من الاتصال وأعد المحاولة.'))
    }
    const timer = setTimeout(fail, 20000),
      poll = setInterval(ready, 200)
    win.onYouTubeIframeAPIReady = ready
    script.onerror = fail
    document.head.append(script)
  })
  return loading
}
