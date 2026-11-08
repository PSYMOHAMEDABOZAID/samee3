/**
 * Prefer the publisher for public, browser-playable audio instead of using
 * Vercel as an MP3 transport. Other publishers retain the existing proxy.
 * No Alafasy track is eligible: keep all Alafasy workflows unchanged.
 */
const DIRECT_PUBLISHERS = new Set([
  'quran.tv',
  'ar.assabile.com',
  'www.assabile.com',
])

const AUDIO_EXTENSIONS = /\.(?:mp3|m4a|ogg|wav|aac|opus)$/i

export function isAlafasyTrack(track: {
  title?: string
  subtitle?: string
  library?: { reciterName?: string; sourceName?: string }
}): boolean {
  return /(?:العفاسي|alafasy|afasy|mishary|مشاري)/i.test(
    [track.title, track.subtitle, track.library?.reciterName, track.library?.sourceName].join(' '),
  )
}

export function directLibraryStreamingUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (
      parsed.protocol !== 'https:' ||
      parsed.port || parsed.username || parsed.password || parsed.hash ||
      !DIRECT_PUBLISHERS.has(parsed.hostname.toLowerCase()) ||
      !AUDIO_EXTENSIONS.test(parsed.pathname)
    ) return null
    return parsed.href
  } catch {
    return null
  }
}
