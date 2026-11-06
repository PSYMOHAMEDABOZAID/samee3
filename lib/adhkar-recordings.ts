import { normalizeAdhkarSearch } from './adhkar-catalog'
import type { LocalAdhkarSection } from './adhkar-local-audio'
import type { PlaybackTrack } from './persistent-player'

export const ADHKAR_RECORDING_TYPES = [
  ['all', 'الكل'], ['morning', 'الصباح'], ['evening', 'المساء'], ['sleep', 'النوم'],
  ['waking', 'الاستيقاظ'], ['day-and-night', 'اليوم والليلة'], ['chapter', 'أبواب الأذكار'],
] as const
export type RecordingType = typeof ADHKAR_RECORDING_TYPES[number][0]
export function filterCompleteAdhkar(recordings: LocalAdhkarSection[], names: Record<string, string>, reader: string, type: RecordingType, query: string) {
  const terms = normalizeAdhkarSearch(query).toLowerCase().trim().split(/\s+/).filter(Boolean)
  return recordings.filter(recording => (!reader || recording.readerId === reader) && (type === 'all' || recording.type === type)
    && terms.every(term => normalizeAdhkarSearch(`${recording.title} ${names[recording.readerId] || ''} ${recording.readerId}`).toLowerCase().includes(term)))
}
export function recordingPlaybackTracks(recordings: LocalAdhkarSection[], names: Record<string, string>): PlaybackTrack[] {
  return recordings.map(recording => ({ url: recording.url, title: recording.title, subtitle: names[recording.readerId] || '',
    adhkar: { section: recording.title, recordingId: recording.id } }))
}
export function recordingDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000)), minutes = Math.floor(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
