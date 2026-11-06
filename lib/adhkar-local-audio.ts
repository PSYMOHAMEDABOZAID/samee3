import source from '@/public/data/adhkar-audio/v1/manifest.json'
import { isLocalAdhkarMediaPath } from './adhkar-media-path'
type Section = 'morning' | 'evening' | 'sleep' | 'waking'
export type LocalAdhkarSection = {
  id: string; readerId: string; title: string; type: Section | 'day-and-night' | 'chapter'
  categoryIds: number[]; url: string; bytes: number; durationMs: number; sourcePage: string; rightsId: string
  source: { url: string; sha256: string; startMs: number; endMs: number }
}
type Manifest = {
  datasetVersion: string
  reciters: { id: string; name: string; sourcePage: string; individualAudioCount: number; sectionAudioCount: number; coverage: string }[]
  byOriginalAudioId: Record<string, Record<string, string>>
  byOriginalAudioIdAndSection: Record<string, Record<string, Partial<Record<Section, string>>>>
  contextSectionByURL: Record<string, string>; sections: LocalAdhkarSection[]
}
const manifest = source as Manifest
export function localAdhkarAudio(reader: string, item: {audio?: string | null}, section?: Section): string | null {
  const match = /(?:^|\/)audio\/([a-z0-9_-]+)\.mp3(?:\?.*)?$/i.exec(item.audio || '')
  if (!match) return null
  const variant = section ? manifest.byOriginalAudioIdAndSection[match[1]]?.[reader]?.[section] : undefined
  const value = variant || manifest.byOriginalAudioId[match[1]]?.[reader]
  if (typeof value !== 'string' || !isLocalAdhkarMediaPath(value)) return null
  const context = manifest.contextSectionByURL[value]
  return section && (context === 'morning' || context === 'evening') && context !== section ? null : value
}
export function hasLocalAdhkarReader(reader: string): boolean { return manifest.reciters.some(r => r.id === reader && r.individualAudioCount > 0) }
export const localAdhkarVersion = manifest.datasetVersion
export function localAdhkarReaders() { return manifest.reciters }
export function localAdhkarSections(reader?: string): LocalAdhkarSection[] { return reader ? manifest.sections.filter(s => s.readerId === reader) : manifest.sections }
export function localAdhkarSectionUrl(value: string): string | null {
  const section = manifest.sections.find(s => s.url === value || s.source.url === value)
  return section && isLocalAdhkarMediaPath(section.url) ? section.url : null
}
