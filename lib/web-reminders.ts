import { PRAYERS, locationDate, prayerInstant, shiftPrayerDate, type PrayerDay } from './prayer-times'
import hadithCorpus from '@/native/shared/reminders.json'
export const PRAYER_METHODS = [[8, 'الخليج'], [4, 'أم القرى'], [5, 'الهيئة المصرية للمساحة'], [3, 'رابطة العالم الإسلامي'], [1, 'جامعة كراتشي'], [2, 'أمريكا الشمالية'], [9, 'الكويت'], [10, 'قطر'], [11, 'سنغافورة'], [12, 'فرنسا'], [13, 'تركيا'], [14, 'روسيا'], [15, 'لجنة رؤية الهلال'], [16, 'دبي'], [18, 'تونس'], [19, 'الجزائر'], [20, 'إندونيسيا'], [21, 'المغرب'], [22, 'البرتغال'], [23, 'الأردن']] as const
export const WEB_SETTINGS_KEY = 'samee3_web_reminders_v1'
export type WebReminderSettings = {
  quran: boolean; adhkar: boolean; hadith: boolean; prayer: boolean; audio: boolean; library: boolean
  quranTime: string; morningTime: string; eveningTime: string; audioTime: string; libraryTime: string
  hadithHours: number; hadithStart: number; hadithEnd: number
  timezone: string; latitude: number | null; longitude: number | null; city: string; method: number; school: number; prayers: string[]
}
export const DEFAULT_WEB_REMINDERS: WebReminderSettings = {
  quran: true, adhkar: true, hadith: false, prayer: false, audio: false, library: false,
  quranTime: '20:00', morningTime: '07:00', eveningTime: '17:00', audioTime: '13:00', libraryTime: '19:00',
  hadithHours: 3, hadithStart: 8, hadithEnd: 22,
  timezone: 'Asia/Muscat', latitude: null, longitude: null, city: 'الموقع المختار', method: 8, school: 0,
  prayers: PRAYERS.map(p => p.id),
}
export function parseWebSettings(raw: unknown): WebReminderSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('إعدادات التذكيرات غير صالحة.')
  const value = raw as Record<string, unknown>, result = { ...DEFAULT_WEB_REMINDERS }
  for (const key of ['quran', 'adhkar', 'hadith', 'prayer', 'audio', 'library'] as const) {
    if (typeof value[key] !== 'boolean') throw new Error('اختر فئات التذكيرات.')
    result[key] = value[key]
  }
  for (const key of ['quranTime', 'morningTime', 'eveningTime', 'audioTime', 'libraryTime'] as const) {
    if (typeof value[key] !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value[key])) throw new Error('اكتب المواعيد بصيغة ساعة ودقيقة.')
    result[key] = value[key]
  }
  if (typeof value.timezone !== 'string' || !value.timezone.trim() || value.timezone.length > 80) throw new Error('حدد منطقة زمنية صحيحة.')
  try { locationDate(new Date(), value.timezone) } catch { throw new Error('المنطقة الزمنية غير صالحة.') }
  result.timezone = value.timezone
  if (!Number.isInteger(value.method) || !PRAYER_METHODS.some(([id]) => id === value.method) || ![0, 1].includes(Number(value.school))) throw new Error('اختر طريقة حساب صحيحة.')
  result.method = Number(value.method); result.school = Number(value.school)
  for (const [key, max] of [['latitude', 90], ['longitude', 180]] as const) {
    const field = value[key]
    if (field !== null && field !== undefined && (typeof field !== 'number' || !Number.isFinite(field) || Math.abs(field) > max)) throw new Error('إحداثيات الموقع غير صحيحة.')
    result[key] = typeof field === 'number' ? Math.round(field * 10000) / 10000 : null
  }
  result.city = typeof value.city === 'string' ? value.city.trim().slice(0, 100) : 'الموقع المختار'
  result.prayers = Array.isArray(value.prayers) ? [...new Set(value.prayers.filter((id): id is string => typeof id === 'string' && PRAYERS.some(p => p.id === id)))] : []
  if (result.prayer && (result.latitude === null || result.longitude === null || !result.prayers.length)) throw new Error('حدد موقعك والصلوات المطلوبة لتفعيل تنبيهات الصلاة.')
  for (const [key, min, max] of [['hadithHours', 1, 12], ['hadithStart', 0, 23], ['hadithEnd', 1, 24]] as const) {
    if (!Number.isInteger(value[key]) || Number(value[key]) < min || Number(value[key]) > max) throw new Error('راجع فترة تذكير الحديث.')
    result[key] = Number(value[key])
  }
  if (result.hadithStart >= result.hadithEnd) throw new Error('بداية تذكير الحديث يجب أن تسبق نهايته.')
  return result
}
export type ReminderEvent = { at: number; kind: string; title: string; body: string; url: string }
/** Civil dates in the selected timezone, including DST and the following day's Fajr. */
export function reminderEvents(settings: WebReminderSettings, after: number, days: PrayerDay[] = []): ReminderEvent[] {
  const events: ReminderEvent[] = [], today = locationDate(new Date(after), settings.timezone)
  const add = (date: string, time: string, kind: string, title: string, body: string, url: string) => {
    const at = prayerInstant(date, time, settings.timezone)
    if (Number.isFinite(at) && at > after) events.push({ at, kind, title, body, url })
  }
  for (let offset = 0; offset < 3; offset++) {
    const date = shiftPrayerDate(today, offset)
    if (settings.quran) add(date, settings.quranTime, 'quran', 'وردك من القرآن', 'افتح المصحف وتابع تلاوتك من حيث توقفت.', '/mushaf')
    if (settings.adhkar) {
      add(date, settings.morningTime, 'morning', 'أذكار الصباح', 'ابدأ يومك بذكر الله.', '/adhkar/read?type=morning')
      add(date, settings.eveningTime, 'evening', 'أذكار المساء', 'حان موعد أذكار المساء.', '/adhkar/read?type=evening')
    }
    if (settings.audio) add(date, settings.audioTime, 'audio', 'تذكير الاستماع', 'استمع إلى تلاوة من المكتبة الصوتية.', '/audio')
    if (settings.library && new Date(date + 'T12:00:00Z').getUTCDay() === 5) add(date, settings.libraryTime, 'library', 'رحلتك في طلب العلم', 'تابع كتابك وشرحك في المكتبة الشرعية.', '/islamic-library')
    if (settings.hadith) for (let hour = settings.hadithStart; hour < settings.hadithEnd; hour += settings.hadithHours) {
      const short = hadithCorpus.hadiths.filter(item => item.text.length < 500)
      const hadith = short[(Math.floor(Date.parse(date + 'T12:00:00Z') / 86400000) + hour) % short.length]
      add(date, `${String(hour).padStart(2, '0')}:00`, 'hadith', 'حديث نبوي', `${hadith.text}\n${hadith.reference}`, '/hadith')
    }
  }
  if (settings.prayer) for (const day of days) for (const prayer of PRAYERS) {
    if (!settings.prayers.includes(prayer.id)) continue
    const at = day.instants?.[prayer.id] ?? prayerInstant(day.date, day.timings[prayer.id], day.timezone)
    if (at > after) events.push({ at, kind: prayer.id, title: `حان وقت صلاة ${prayer.name}`, body: `${settings.city} • ${day.timings[prayer.id].slice(0, 5)}. حيّ على الصلاة.`, url: '/prayer' })
  }
  return events.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind))
}
