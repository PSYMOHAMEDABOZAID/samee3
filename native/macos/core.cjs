const path = require('node:path')
const SITE = 'https://samee3.vercel.app'
const LOCAL = 'samee3://app'
const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']
const PRAYER_NAMES = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء']
const KEYS = ['quran', 'morning', 'evening', 'hadith', 'audio', 'library', ...PRAYERS]
const DEFAULTS = {
  quran: false, adhkar: false, hadith: false, prayer: false, audio: false, library: false,
  quranTime: '20:00', morningTime: '07:00', eveningTime: '17:00', audioTime: '13:00', libraryTime: '19:00',
  hadithHours: 3, hadithStart: 8, hadithEnd: 22, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  systemTimezone: true, city: '', country: '', method: 8, school: 0,
  fullAdhan: true, adhanVoice: 'ali-mulla', fajrVoice: 'makkah-fajr', volume: 70, openAtLogin: false,
}
function websiteURL(raw) { try { const u = new URL(raw); return u.origin === SITE && u.protocol === 'https:' && !u.username && !u.password } catch { return false } }
function localURL(raw) { try { const u = new URL(raw); return u.protocol === 'samee3:' && u.host === 'app' && !u.username && !u.password } catch { return false } }
function externalURL(raw) { try { const u = new URL(raw); return ['https:', 'http:', 'mailto:'].includes(u.protocol) && !u.username && !u.password && raw.length < 4096 } catch { return false } }
function resource(raw, root) {
  if (!localURL(raw)) return null
  try {
    const pathname = decodeURIComponent(new URL(raw).pathname)
    if (pathname.includes('\\') || pathname.includes('\0')) return null
    const relative = pathname.replace(/^\//, '')
    if (!/^(?:ui|data)\//.test(relative) || relative.split('/').some(part => part === '..' || part === '.')) return null
    const target = path.resolve(root, relative)
    return target.startsWith(path.resolve(root) + path.sep) ? target : null
  } catch { return null }
}
function settings(raw, voiceIds) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('إعدادات غير صحيحة.')
  const value = { ...DEFAULTS }
  for (const key of ['quran', 'adhkar', 'hadith', 'prayer', 'audio', 'library', 'fullAdhan', 'systemTimezone', 'openAtLogin']) {
    if (raw[key] !== undefined) { if (typeof raw[key] !== 'boolean') throw new Error('اختيار غير صحيح: ' + key); value[key] = raw[key] }
  }
  for (const key of ['quranTime', 'morningTime', 'eveningTime', 'audioTime', 'libraryTime']) {
    if (raw[key] !== undefined) { if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw[key])) throw new Error('أكمل المواعيد بصيغة ساعة ودقيقة.'); value[key] = raw[key] }
  }
  for (const [key, allowed] of [['hadithHours', [1, 2, 3, 4, 6, 12, 24]], ['method', [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 15, 18, 19, 20, 21, 22, 23]], ['school', [0, 1]]]) {
    if (raw[key] !== undefined) { if (!allowed.includes(raw[key])) throw new Error('اختيار غير صحيح: ' + key); value[key] = raw[key] }
  }
  for (const [key, low, high] of [['volume', 1, 100], ['hadithStart', 0, 23], ['hadithEnd', 1, 24]]) {
    if (raw[key] !== undefined) { if (!Number.isInteger(raw[key]) || raw[key] < low || raw[key] > high) throw new Error('قيمة غير صحيحة: ' + key); value[key] = raw[key] }
  }
  if (value.hadithStart >= value.hadithEnd) throw new Error('بداية فترة الحديث يجب أن تسبق نهايتها.')
  for (const key of ['adhanVoice', 'fajrVoice']) {
    if (raw[key] !== undefined) { if (!voiceIds.includes(raw[key])) throw new Error('صوت المؤذن غير موجود.'); value[key] = raw[key] }
  }
  for (const key of ['city', 'country', 'timezone']) if (raw[key] !== undefined) {
    if (typeof raw[key] !== 'string' || raw[key].length > 100 || /[\u0000-\u001f]/.test(raw[key])) throw new Error('نص غير صحيح: ' + key)
    value[key] = raw[key].trim()
  }
  if (value.systemTimezone) value.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format() } catch { throw new Error('المنطقة الزمنية غير صحيحة.') }
  if (value.prayer && (!value.city || !value.country)) throw new Error('اكتب المدينة والدولة لحساب مواقيت الصلاة.')
  return value
}
function enabled(s, key) { return key === 'morning' || key === 'evening' ? s.adhkar : PRAYERS.includes(key) ? s.prayer : s[key] === true }
const formatters = new Map()
function clock(time, timezone) {
  if (!formatters.has(timezone)) formatters.set(timezone, new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }))
  return Object.fromEntries(formatters.get(timezone).formatToParts(new Date(time)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
}
function next(s, key, now, calendar = []) {
  if (!enabled(s, key)) return -1
  if (PRAYERS.includes(key)) return calendar.reduce((best, day) => Number.isFinite(day[key]) && day[key] > now ? Math.min(best, day[key]) : best, Infinity)
  const hours = new Set()
  if (key === 'hadith') for (let hour = s.hadithStart; hour < s.hadithEnd; hour += s.hadithHours) hours.add(String(hour).padStart(2, '0') + ':00')
  else hours.add(s[key === 'morning' ? 'morningTime' : key === 'evening' ? 'eveningTime' : key + 'Time'])
  // Search actual instants: skipped/duplicated clock hours at DST boundaries remain valid.
  const limit = key === 'library' ? 8 * 1440 : 2 * 1440
  for (let i = 0, at = (Math.floor(now / 60000) + 1) * 60000; i < limit; i++, at += 60000) {
    const parts = clock(at, s.timezone)
    if ((key !== 'library' || parts.weekday === 'Fri') && hours.has(parts.hour + ':' + parts.minute)) return at
  }
  return -1
}
function calendarIdentity(s) { return JSON.stringify([s.city, s.country, s.method, s.school]) }
function parseCalendar(raw) {
  if (raw?.code !== 200 || !Array.isArray(raw.data) || raw.data.length > 31) throw new Error('تعذر قراءة جدول الصلاة.')
  return raw.data.map(day => {
    const result = { date: day.date?.gregorian?.date, timezone: day.meta?.timezone }
    for (const key of PRAYERS) {
      const value = day.timings?.[key]
      if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?[+-]\d\d:\d\d$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('المصدر لم يرجع توقيتًا مطلقًا صحيحًا.')
      result[key] = Date.parse(value)
    }
    return result
  })
}
function notification(key, s, hadiths, index = 0) {
  if (key === 'hadith') { const h = hadiths[((index % hadiths.length) + hadiths.length) % hadiths.length]; return { title: 'حديث تقرؤه اليوم', body: h.text + '\n' + h.reference, route: 'hadith:' + h.id } }
  if (PRAYERS.includes(key)) return { title: 'حان وقت صلاة ' + PRAYER_NAMES[PRAYERS.indexOf(key)], body: 'بحسب مواقيت ' + s.city + '. اضغط لفتح مواقيت الصلاة.', route: '/prayer' }
  return {
    quran: { title: 'موعد وردك من القرآن', body: 'دقائق مع القرآن الكريم. اضغط لمتابعة قراءتك.', route: 'reader' },
    morning: { title: 'أذكار الصباح', body: 'ابدأ يومك بذكر الله. اضغط لقراءة أذكار الصباح.', route: '/adhkar/read?type=morning' },
    evening: { title: 'أذكار المساء', body: 'اختم يومك بذكر الله. اضغط لقراءة أذكار المساء.', route: '/adhkar/read?type=evening' },
    audio: { title: 'موعد الاستماع للقرآن', body: 'اختر قارئك واستمع إلى تلاوة من القرآن الكريم.', route: '/audio' },
    library: { title: 'موعد القراءة والتعلّم', body: 'خصص دقائق لكتاب أو درس من المكتبة الشرعية.', route: '/islamic-library' },
  }[key]
}
module.exports = { SITE, LOCAL, PRAYERS, PRAYER_NAMES, KEYS, DEFAULTS, websiteURL, localURL, externalURL, resource, settings, enabled, clock, next, calendarIdentity, parseCalendar, notification }
