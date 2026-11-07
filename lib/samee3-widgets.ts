/** SAMEE3 widgets: browser configuration and privacy-safe native snapshot. */
export type WidgetId =
  | 'reading' | 'ayah' | 'prayer' | 'morning' | 'evening'
  | 'audio' | 'hadith' | 'library' | 'visual' | 'tarbiyah'
  | 'surahs' | 'favorites' | 'reminders' | 'messages'
  | 'profile' | 'tasbih'
export type WidgetTheme = 'emerald' | 'ivory' | 'midnight' | 'sand' | 'royal' | 'rose'
export type WidgetSize = 'small' | 'medium' | 'large'

export interface WidgetDefinition {
  id: WidgetId
  title: string
  description: string
  href: string
  icon: string
  group: string
}
export const WIDGET_CATALOG: readonly WidgetDefinition[] = [
  { id: 'reading', title: 'متابعة القراءة', description: 'آخر صفحة ورواية وقارئ', href: '/mushaf', icon: '📖', group: 'القرآن الكريم' },
  { id: 'ayah', title: 'آية للقراءة', description: 'فتح المصحف والعودة إلى آيتك', href: '/mushaf', icon: '۞', group: 'القرآن الكريم' },
  { id: 'surahs', title: 'فهرس السور', description: 'الوصول إلى السور والروايات', href: '/surahs', icon: '☷', group: 'القرآن الكريم' },
  { id: 'audio', title: 'المكتبة الصوتية', description: 'قارئك واستكمال الاستماع', href: '/audio', icon: '♫', group: 'الصوتيات' },
  { id: 'morning', title: 'أذكار الصباح', description: 'تقدم أذكارك اليوم', href: '/adhkar/read?type=morning', icon: '☀', group: 'الأذكار' },
  { id: 'evening', title: 'أذكار المساء', description: 'تقدم أذكارك اليوم', href: '/adhkar/read?type=evening', icon: '☾', group: 'الأذكار' },
  { id: 'tasbih', title: 'عداد التسبيح', description: 'عداد اختياري محفوظ على الجهاز', href: '/adhkar', icon: '◉', group: 'الأذكار' },
  { id: 'prayer', title: 'مواقيت الصلاة', description: 'الموعد القادم من البيانات المحفوظة', href: '/prayer', icon: '☪', group: 'العبادات' },
  { id: 'hadith', title: 'الحديث الشريف', description: 'فتح المكتبة الحديثية', href: '/hadith', icon: '❞', group: 'المكتبات' },
  { id: 'library', title: 'المكتبة الشرعية', description: 'الكتب والدروس', href: '/islamic-library', icon: '▣', group: 'المكتبات' },
  { id: 'tarbiyah', title: 'التربية الإيمانية', description: 'دروس الأبناء', href: '/tarbiyah-iman', icon: '✦', group: 'المكتبات' },
  { id: 'visual', title: 'الآيات المرئية', description: 'إنشاء بطاقات وفيديوهات الآيات', href: '/visual-ayahs', icon: '▤', group: 'الإبداع' },
  { id: 'favorites', title: 'المحفوظات', description: 'العودة إلى موادك المفضلة', href: '/profile', icon: '♡', group: 'الشخصي' },
  { id: 'reminders', title: 'التذكيرات', description: 'إعداد تذكيرات سميع', href: '/notifications', icon: '♧', group: 'الشخصي' },
  { id: 'messages', title: 'التواصل', description: 'التواصل مع إدارة سميع', href: '/messages', icon: '✉', group: 'الشخصي' },
  { id: 'profile', title: 'حسابي', description: 'الإعدادات والتقدم', href: '/profile', icon: '◎', group: 'الشخصي' },
] as const

export interface WidgetSettings {
  version: 1
  theme: WidgetTheme
  size: WidgetSize
  showDetails: boolean
  arabicDigits: boolean
  showPersonalData: boolean
  enabled: WidgetId[]
  order: WidgetId[]
}
export interface WidgetPayload {
  id: WidgetId
  title: string
  subtitle: string
  detail: string
  url: string
  icon: string
  available: boolean
}
export interface WidgetSnapshot {
  version: 1
  generatedAt: number
  theme: WidgetTheme
  size: WidgetSize
  showDetails: boolean
  widgets: WidgetPayload[]
}

export const SETTINGS_KEY = 'samee3_widget_settings_v1'
export const SNAPSHOT_KEY = 'samee3_widget_snapshot_v1'
const COUNTER_KEY = 'samee3_widget_tasbih_count_v1'
const defaultEnabled: WidgetId[] = ['reading', 'prayer', 'morning', 'evening', 'audio', 'tasbih']
const IDs = new Set<string>(WIDGET_CATALOG.map(item => item.id))
export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  version: 1, theme: 'emerald', size: 'medium', showDetails: true,
  arabicDigits: true, showPersonalData: true,
  enabled: defaultEnabled, order: WIDGET_CATALOG.map(item => item.id),
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function safeJSON(key: string): unknown {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(window.localStorage.getItem(key) || 'null') as unknown } catch { return null }
}
function validIds(value: unknown): WidgetId[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((id): id is WidgetId => typeof id === 'string' && IDs.has(id))))
}
export function loadWidgetSettings(): WidgetSettings {
  const input = safeJSON(SETTINGS_KEY)
  if (!isObject(input)) return { ...DEFAULT_WIDGET_SETTINGS, enabled: [...defaultEnabled], order: [...DEFAULT_WIDGET_SETTINGS.order] }
  const theme = input.theme
  const size = input.size
  const order = validIds(input.order)
  return {
    version: 1,
    theme: theme === 'ivory' || theme === 'midnight' || theme === 'sand' || theme === 'royal' || theme === 'rose' ? theme : 'emerald',
    size: size === 'small' || size === 'large' ? size : 'medium',
    showDetails: typeof input.showDetails === 'boolean' ? input.showDetails : true,
    arabicDigits: typeof input.arabicDigits === 'boolean' ? input.arabicDigits : true,
    showPersonalData: typeof input.showPersonalData === 'boolean' ? input.showPersonalData : true,
    enabled: Array.isArray(input.enabled) ? validIds(input.enabled) : [...defaultEnabled],
    order: [...order, ...WIDGET_CATALOG.map(item => item.id).filter(id => !order.includes(id))],
  }
}
export function saveWidgetSettings(settings: WidgetSettings): void {
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage may be disabled */ }
  window.dispatchEvent(new Event('samee3:widget-settings'))
}
function positiveInt(value: unknown, max: number): number | null {
  const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value)
  return Number.isSafeInteger(n) && n > 0 && n <= max ? n : null
}
function shortText(value: unknown, max = 80): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}
function formatNumber(number: number, settings: WidgetSettings): string {
  return number.toLocaleString(settings.arabicDigits ? 'ar-EG' : 'en-US')
}
function validRiwaya(value: unknown): string {
  const map: Record<string, string> = { hafs: 'حفص', warsh: 'ورش', qalun: 'قالون', douri: 'الدوري', shubah: 'شعبة', sousi: 'السوسي', bazzi: 'البزي' }
  return typeof value === 'string' ? (map[value] || '') : ''
}
function readingInfo(settings: WidgetSettings): { page: number; surah: number | null; ayah: string; reciter: string; riwaya: string; href: string } | null {
  for (const key of ['samee3_persistent_reading_v2', 'samee3_persistent_audio_v2']) {
    const data = safeJSON(key)
    if (!isObject(data)) continue
    const page = positiveInt(data.lastReadPage ?? data.page, 604)
    if (!page) continue
    const ayahKey = typeof data.lastReadAyahKey === 'string' ? data.lastReadAyahKey.split(':') : null
    const surah = positiveInt(data.lastReadSurahNumber ?? data.surah ?? ayahKey?.[0], 114)
    const ayah = positiveInt(ayahKey?.[1] ?? data.ayah, 286)
    const savedRiwaya = data.lastReadRiwayaId ?? data.riwaya
    const riwaya = validRiwaya(savedRiwaya)
    const params = new URLSearchParams({ page: String(page) })
    if (typeof savedRiwaya === 'string' && validRiwaya(savedRiwaya)) params.set('riwaya', savedRiwaya)
    if (surah) params.set('surah', String(surah))
    if (surah && ayah) params.set('ayah', `${surah}:${ayah}`)
    const reciterId = positiveInt(data.lastReadReciterId ?? data.reciterId, 100000)
    if (reciterId) params.set('reciterId', String(reciterId))
    return { page, surah, ayah: surah && ayah ? `${formatNumber(surah, settings)}:${formatNumber(ayah, settings)}` : '', reciter: shortText(data.lastReadReciterName ?? data.reciterName), riwaya, href: `/mushaf?${params.toString()}` }
  }
  return null
}
function adhkarCompleted(type: 'morning' | 'evening'): number | null {
  const data = safeJSON(`samee3_adhkar_progress_v2_${type}`)
  if (!isObject(data) || !isObject(data.counts) || typeof data.savedAt !== 'number') return null
  const saved = new Date(data.savedAt)
  const now = new Date()
  if (saved.getFullYear() !== now.getFullYear() || saved.getMonth() !== now.getMonth() || saved.getDate() !== now.getDate()) return null
  return Object.values(data.counts).filter(value => Number(value) === 0).length
}
function nextCachedPrayer(): { name: string; time: string; city: string } | null {
  const data = safeJSON('samee3_prayer_days_v1')
  if (!isObject(data) || !Array.isArray(data.days)) return null
  const labels: Record<string, string> = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' }
  // Convert both current date and clock using the prayer API's timezone, never the device's guessed locale.
  for (const day of data.days) {
    if (!isObject(day) || !isObject(day.timings) || typeof day.date !== 'string') continue
    const timeZone = shortText(day.timezone, 70)
    try {
      const opts: Intl.DateTimeFormatOptions = { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
      const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(new Date())
      const p = (name: string): string => parts.find(item => item.type === name)?.value || '00'
      const today = `${p('year')}-${p('month')}-${p('day')}`
      if (day.date < today) continue
      const minutesNow = Number(p('hour')) * 60 + Number(p('minute'))
      for (const [id, label] of Object.entries(labels)) {
        const raw = day.timings[id]
        if (typeof raw !== 'string') continue
        const match = raw.match(/^(\d{1,2}):(\d{2})/)
        if (!match) continue
        const minutes = Number(match[1]) * 60 + Number(match[2])
        if (day.date > today || minutes > minutesNow) return { name: label, time: match[0], city: shortText(data.city, 60) }
      }
    } catch { return null }
  }
  return null
}
export function getTasbihCount(): number {
  const count = safeJSON(COUNTER_KEY)
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 && count <= 100000000 ? count : 0
}
export function updateTasbih(delta: number): number {
  const next = Math.max(0, Math.min(100000000, getTasbihCount() + delta))
  try { localStorage.setItem(COUNTER_KEY, JSON.stringify(next)) } catch { /* private mode */ }
  window.dispatchEvent(new Event('samee3:widget-settings'))
  return next
}
export function buildWidgetSnapshot(settings: WidgetSettings): WidgetSnapshot {
  const reading = settings.showPersonalData ? readingInfo(settings) : null
  const prayer = nextCachedPrayer()
  const morning = settings.showPersonalData ? adhkarCompleted('morning') : null
  const evening = settings.showPersonalData ? adhkarCompleted('evening') : null
  const counter = settings.showPersonalData ? getTasbihCount() : null
  const widgets = settings.order.filter(id => settings.enabled.includes(id)).map(id => {
    const def = WIDGET_CATALOG.find(item => item.id === id)!
    let subtitle = def.description
    let detail = ''
    let url = def.href
    let available = true
    switch (id) {
      case 'reading':
        available = Boolean(reading)
        subtitle = reading ? `الصفحة ${formatNumber(reading.page, settings)} من ${formatNumber(604, settings)}` : 'ابدأ القراءة من المصحف'
        detail = reading ? [reading.riwaya, reading.reciter].filter(Boolean).join(' • ') : 'لم يُحفظ تقدم قراءة على الجهاز بعد'
        if (reading) url = reading.href
        break
      case 'ayah':
        available = Boolean(reading?.ayah)
        subtitle = reading?.ayah ? `الآية ${reading.ayah}` : 'اختر آية من المصحف'
        detail = 'لا تُعرض آية غير محققة من مصدر المصحف'
        if (reading) url = reading.href
        break
      case 'prayer':
        available = Boolean(prayer)
        subtitle = prayer ? `الصلاة القادمة: ${prayer.name}` : 'افتح المواقيت لتحديث البيانات'
        detail = prayer ? `${prayer.time}${settings.showPersonalData && prayer.city ? ` • ${prayer.city}` : ''}` : 'المواقيت غير محفوظة أو غير صالحة لهذا اليوم'
        break
      case 'morning':
      case 'evening': {
        const count = id === 'morning' ? morning : evening
        available = count !== null
        subtitle = count === null ? 'افتح الأذكار لمتابعة وردك' : `أذكار مكتملة: ${formatNumber(count, settings)}`
        detail = 'حالة الورد محفوظة على هذا الجهاز'
        break
      }
      case 'tasbih':
        subtitle = `التسبيح: ${formatNumber(counter || 0, settings)}`
        detail = 'يمكن زيادة العداد من مركز الويدجت'
        break
      case 'audio':
        subtitle = reading?.reciter ? `القارئ: ${reading.reciter}` : 'اختر التلاوة من المكتبة الصوتية'
        detail = 'فتح المكتبة الصوتية'
        break
      default:
        break
    }
    return { id, title: def.title, subtitle, detail: settings.showDetails ? detail : '', url, icon: def.icon, available } satisfies WidgetPayload
  })
  return { version: 1, generatedAt: Date.now(), theme: settings.theme, size: settings.size, showDetails: settings.showDetails, widgets }
}
export function persistSnapshot(snapshot: WidgetSnapshot): void {
  try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)) } catch { /* storage unavailable */ }
}
