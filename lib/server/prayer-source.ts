import { apiPrayerDate, parsePrayerDay, type PrayerDay } from '@/lib/prayer-times'
export type PrayerLocation = { latitude: number; longitude: number; method: number; school: number; timezone?: string }
const memory = new Map<string, { day: PrayerDay; payload: unknown; until: number }>()
export async function prayerSource(date: string, location: PrayerLocation) {
  const params = new URLSearchParams({ latitude: String(location.latitude), longitude: String(location.longitude), method: String(location.method), school: String(location.school), iso8601: 'true' })
  if (location.timezone) params.set('timezonestring', location.timezone)
  const key = date + '?' + params, previous = memory.get(key)
  if (previous && previous.until > Date.now()) return previous
  let last: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(`https://api.aladhan.com/v1/timings/${apiPrayerDate(date)}?${params}`, { signal: AbortSignal.timeout(12000), next: { revalidate: 21600 } })
      if (!response.ok) throw new Error('تعذر الاتصال بمصدر مواقيت الصلاة.')
      const payload: unknown = await response.json(), day = parsePrayerDay(payload)
      if (day.date !== date) throw new Error('المصدر أعاد يومًا مختلفًا عن اليوم المطلوب.')
      const result = { day, payload, until: Date.now() + 6 * 3600000 }
      if (memory.size > 500) memory.clear()
      memory.set(key, result); return result
    } catch (error) { last = error }
  }
  throw last
}
