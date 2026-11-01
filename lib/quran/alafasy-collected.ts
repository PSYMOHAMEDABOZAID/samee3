/**
 * مشاري العفاسي – المصحف المجمع، تسجيل مستقل عن مصاحف MP3Quran.
 * The release must first contain 001.mp3 … 114.mp3 and timings-001.json … timings-114.json.
 */
export const ALAFASY_COLLECTED_RECITER_ID = 9000123
export const ALAFASY_COLLECTED_MOSHAF_ID = 900012301
export const ALAFASY_COLLECTED_NAME = 'مشاري العفاسي – مصحف مجمع'
export const ALAFASY_COLLECTED_RELEASE =
  'https://github.com/PSYMOHAMEDABOZAID/alafasy-collected-quran/releases/download/v1.0.0'
export const ALAFASY_COLLECTED_SURAH_IDS = Array.from({ length: 114 }, (_, index) => index + 1)
export const ALAFASY_COLLECTED_SURAH_LIST = ALAFASY_COLLECTED_SURAH_IDS.join(',')

/** Matches the established app/audio/page.tsx Reciter/Moshaf shape. */
export function collectedAlafasyLibraryReciter(riwayaId: number) {
  return {
    id: ALAFASY_COLLECTED_RECITER_ID,
    name: ALAFASY_COLLECTED_NAME,
    moshaf: [{
      id: ALAFASY_COLLECTED_MOSHAF_ID,
      name: 'حفص عن عاصم – مصحف مجمع',
      server: '/api/alafasy-audio/',
      surah_total: 114,
      rewaya_id: riwayaId,
      moshaf_type: 0,
      surah_list: ALAFASY_COLLECTED_SURAH_LIST,
    }],
  }
}

/** Matches the established app/mushaf/page.tsx LocalReciter shape. */
export function collectedAlafasyMushafReciter() {
  return {
    id: `${ALAFASY_COLLECTED_RECITER_ID}-${ALAFASY_COLLECTED_MOSHAF_ID}`,
    apiId: ALAFASY_COLLECTED_RECITER_ID,
    label: ALAFASY_COLLECTED_NAME,
    moshafId: ALAFASY_COLLECTED_MOSHAF_ID,
    // The SAMEE3 mushaf player appends '002.mp3' to this server URL.
    // Keep the ending slash, matching the audio-library reciter.
    server: `${ALAFASY_COLLECTED_RELEASE}/`,
    surahIds: ALAFASY_COLLECTED_SURAH_IDS,
  }
}

export type CollectedAlafasyTiming = {
  ayah: number
  start_time: number
  end_time: number
}

/** Same-origin API: prevents direct browser CORS requests to GitHub's JSON assets. */
export async function loadCollectedAlafasyTimings(surah: number): Promise<CollectedAlafasyTiming[]> {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return []
  const response = await fetch(`/api/alafasy-timings/${surah}`, { cache: 'force-cache' })
  if (!response.ok) throw new Error(`Timings unavailable for surah ${surah} (${response.status})`)
  const value: unknown = await response.json()
  if (!Array.isArray(value)) throw new Error('Invalid collected Alafasy timings')
  const timings: CollectedAlafasyTiming[] = value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Invalid timing entry')
    }
    const row = entry as Record<string, unknown>
    const ayah = Number(row.ayah)
    const start_time = Number(row.start_time)
    const end_time = Number(row.end_time)
    if (!Number.isInteger(ayah) || ayah < 1 || !Number.isFinite(start_time) ||
        !Number.isFinite(end_time) || start_time < 0 || end_time <= start_time) {
      throw new Error('Malformed collected Alafasy timing row')
    }
    return { ayah, start_time, end_time }
  })
  if (!timings.length) throw new Error('Empty collected Alafasy timings')
  return timings
}
