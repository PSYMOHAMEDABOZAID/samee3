'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Clock3, X, Check, TimerOff } from 'lucide-react'
import { appAudio } from '@/lib/app-audio'

/**
 * One persistent, user-initiated deadline, shared across Next.js routes.
 * Does not call OS APIs and cannot close a browser/PWA window: "close reading"
 * means stop its sound and return to the main page.
 */
const KEY = 'samee3_sleep_timer_v1'
const EXPIRED_KEY = 'samee3_sleep_timer_expired_v1'
const CHANGED_EVENT = 'samee3:sleep-timer-changed'
const OPEN_EVENT = 'samee3:open-sleep-timer'
function notifyChanged() { window.dispatchEvent(new Event(CHANGED_EVENT)) }
type Mode = 'audio' | 'mushaf' | 'adhkar' | 'all'
type TimerRecord = { id: string; until: number; mode: Mode }
const MODES: { value: Mode; label: string; detail: string }[] = [
  { value: 'audio', label: 'إيقاف الصوت', detail: 'إيقاف كل التلاوات والأذكار الصوتية' },
  { value: 'mushaf', label: 'إغلاق المصحف', detail: 'إيقاف صوت المصحف والعودة للرئيسية' },
  { value: 'adhkar', label: 'إغلاق الأذكار', detail: 'إيقاف الأذكار والعودة للرئيسية' },
  { value: 'all', label: 'إيقاف الكل', detail: 'إيقاف الأصوات والخروج من صفحات القراءة' },
]
const PRESETS = [10, 15, 20, 30, 45, 60, 90]

function validMode(value: unknown): value is Mode {
  return value === 'audio' || value === 'mushaf' || value === 'adhkar' || value === 'all'
}
function readTimer(): TimerRecord | null {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!data || typeof data !== 'object') return null
    const timer = data as Partial<TimerRecord>
    if (
      typeof timer.id !== 'string' || timer.id.length > 80 ||
      typeof timer.until !== 'number' || !Number.isFinite(timer.until) ||
      timer.until > Date.now() + 24 * 60 * 60 * 1000 ||
      !validMode(timer.mode)
    ) return null
    return timer as TimerRecord
  } catch { return null }
}

function stopMushafAudio() {
  const global = window as Window & {
    __samee3PersistentAudio?: HTMLAudioElement & {
      __samee3Continue?: boolean
      __samee3Serial?: number
      __samee3Switching?: boolean
    }
  }
  const player = global.__samee3PersistentAudio
  if (!player) return
  // This is the established persistent-mushaf pause contract. Do this before
  // calling pause(), so background-resume does not restart the recitation.
  player.__samee3Continue = false
  player.__samee3Switching = false
  player.__samee3Serial = Number(player.__samee3Serial || 0) + 1
  try { player.pause() } catch { /* source may already be gone */ }
}

function endPlayback(mode: Mode, pathname: string, goHome: () => void) {
  if (mode === 'audio' || mode === 'all') {
    appAudio.stop()
    stopMushafAudio()
    document.querySelectorAll('audio, video').forEach(media => {
      try { (media as HTMLMediaElement).pause() } catch { /* disposed media */ }
    })
  } else if (mode === 'mushaf') {
    stopMushafAudio()
  } else {
    appAudio.stop('adhkar')
  }
  try { window.dispatchEvent(new CustomEvent('samee3:sleep-expired', { detail: { mode } })) } catch {}

  const isMushaf = pathname === '/mushaf' || pathname.startsWith('/mushaf/')
  const isAdhkar = pathname === '/adhkar' || pathname.startsWith('/adhkar/')
  const isAudio = pathname === '/audio' || pathname.startsWith('/audio/')
  if (
    (mode === 'mushaf' && isMushaf) ||
    (mode === 'adhkar' && isAdhkar) ||
    (mode === 'all' && (isMushaf || isAdhkar || isAudio))
  ) goHome()
}

function timeLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 60000))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return hours > 0 ? `${hours} س ${minutes} د` : `${minutes} دقيقة`
}

export default function Samee3SleepTimer() {
  const pathname = usePathname() || '/'
  const router = useRouter()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  const [isOpen, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('audio')
  const [minutes, setMinutes] = useState(30)
  const [timeKind, setTimeKind] = useState<'duration' | 'clock'>('duration')
  const [clockTime, setClockTime] = useState('23:00')
  const [record, setRecord] = useState<TimerRecord | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [notice, setNotice] = useState('')
  const completed = useRef(new Set<string>())

  const expire = useCallback((timer: TimerRecord) => {
    if (completed.current.has(timer.id)) return
    completed.current.add(timer.id)
    try {
      const current = readTimer()
      if (current?.id === timer.id) localStorage.removeItem(KEY)
      localStorage.setItem(EXPIRED_KEY, JSON.stringify({ ...timer, at: Date.now() }))
    } catch { /* storage may be unavailable in private mode */ }
    endPlayback(timer.mode, pathnameRef.current, () => router.replace('/'))
    notifyChanged()
    setRecord(null)
    setRemaining(0)
    setNotice('انتهى الوقت المحدد، وتم إيقاف التشغيل حسب اختيارك.')
    setOpen(false)
  }, [router])

  const check = useCallback(() => {
    const timer = readTimer()
    if (!timer) { setRecord(null); setRemaining(0); return }
    const left = timer.until - Date.now()
    if (left <= 0) { expire(timer); return }
    setRecord(previous => previous?.id === timer.id ? previous : timer)
    setRemaining(left)
  }, [expire])

  useEffect(() => {
    const openDialog = () => { setNotice(''); setOpen(true) }
    window.addEventListener(OPEN_EVENT, openDialog)
    return () => window.removeEventListener(OPEN_EVENT, openDialog)
  }, [])

  useEffect(() => {
    check()
    let attachedQuran: HTMLAudioElement | null = null
    let attachedAppAudio: HTMLAudioElement | null = null
    const keepMediaObserved = () => {
      const quran = (window as Window & { __samee3PersistentAudio?: HTMLAudioElement }).__samee3PersistentAudio || null
      const persistent = appAudio.element()
      if (attachedQuran !== quran) {
        attachedQuran?.removeEventListener('timeupdate', onFocus)
        attachedQuran = quran
        attachedQuran?.addEventListener('timeupdate', onFocus)
      }
      if (attachedAppAudio !== persistent) {
        attachedAppAudio?.removeEventListener('timeupdate', onFocus)
        attachedAppAudio = persistent
        attachedAppAudio?.addEventListener('timeupdate', onFocus)
      }
    }
    const interval = window.setInterval(() => { keepMediaObserved(); check() }, 1000)
    const onFocus = () => check()
    const onStorage = (event: StorageEvent) => {
      if (event.key === KEY) check()
      if (event.key === EXPIRED_KEY && event.newValue) {
        try {
          const item: unknown = JSON.parse(event.newValue)
          if (item && typeof item === 'object') {
            const timer = item as TimerRecord
            const current = readTimer()
            if (typeof timer.id === 'string' && validMode(timer.mode) &&
              (!current || current.id === timer.id) && !completed.current.has(timer.id)) {
              completed.current.add(timer.id)
              endPlayback(timer.mode, pathnameRef.current, () => router.replace('/'))
              notifyChanged()
              setRecord(null)
              setRemaining(0)
              setNotice('انتهى مؤقت القراءة.')
            }
          }
        } catch {}
      }
    }
    keepMediaObserved()
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onFocus)
    window.addEventListener('storage', onStorage)
    // `timeupdate` often continues while audio plays with the screen locked.
    // Browser/OS suspension can still delay JavaScript; see README.
    document.addEventListener('timeupdate', onFocus, true)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onFocus)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('timeupdate', onFocus, true)
      attachedQuran?.removeEventListener('timeupdate', onFocus)
      attachedAppAudio?.removeEventListener('timeupdate', onFocus)
    }
  }, [check, router])

  // If the Qur'an audio element is first created after this component mounts,
  // the interval above still checks the deadline; no global player is replaced.
  const start = () => {
    let until = 0
    if (timeKind === 'duration') {
      const duration = Number(minutes)
      if (!Number.isInteger(duration) || duration < 1 || duration > 480) {
        setNotice('اكتب مدة صحيحة بين دقيقة واحدة و480 دقيقة.')
        return
      }
      until = Date.now() + duration * 60 * 1000
    } else {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(clockTime)) {
        setNotice('اختار ساعة صحيحة للإيقاف.')
        return
      }
      const [hour, minute] = clockTime.split(':').map(Number)
      const target = new Date()
      target.setHours(hour, minute, 0, 0)
      if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1)
      until = target.getTime()
    }
    const next: TimerRecord = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      mode,
      until,
    }
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* will remain active in this tab */ }
    notifyChanged()
    setRecord(next)
    setRemaining(next.until - Date.now())
    setNotice('تم تشغيل مؤقت القراءة.')
    setOpen(false)
  }
  const cancel = () => {
    try { localStorage.removeItem(KEY) } catch {}
    notifyChanged()
    setRecord(null)
    setRemaining(0)
    setNotice('تم إلغاء المؤقت.')
    setOpen(false)
  }

  // UI lives inside PersistentAudioPlayer. No floating timer button over Qur'an text.
  return <>
    {isOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4" dir="rtl" role="presentation" onMouseDown={(event: MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section role="dialog" aria-modal="true" aria-label="إعداد مؤقت القراءة" className="w-full max-w-md rounded-3xl border border-[#d9c39d] bg-[#fffbf3] p-5 text-[#194f43] shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><Clock3 size={22} /> مؤقت القراءة</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق" className="rounded-xl p-2 hover:bg-[#eae1d2]"><X size={20}/></button>
        </div>
        <p className="mb-4 text-sm text-[#5c665b]">حدد الوقت اللي تحب يتوقف فيه التشغيل تلقائيًا. تقدر تتنقل بين الأقسام والمؤقت يفضل محفوظ.</p>
        <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="نوع الإيقاف">
          {MODES.map(option => <button key={option.value} type="button" aria-pressed={mode === option.value} onClick={() => setMode(option.value)} className={`rounded-xl border px-3 py-3 text-right text-xs ${mode === option.value ? 'border-[#1f5948] bg-[#e2efe7]' : 'border-[#ded5c7] bg-white'}`}>
            <span className="block font-bold">{mode === option.value && <Check size={14} className="ml-1 inline" aria-hidden="true" />}{option.label}</span>
            <span className="mt-1 block text-[11px] leading-5 text-[#667268]">{option.detail}</span>
          </button>)}
        </div>
        <div className="mb-3 flex gap-2" role="group" aria-label="تحديد وقت الإيقاف">
          <button type="button" onClick={() => setTimeKind('duration')} aria-pressed={timeKind === 'duration'} className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${timeKind === 'duration' ? 'bg-[#194f43] text-white' : 'bg-[#e9e3d8]'}`}>بعد مدة</button>
          <button type="button" onClick={() => setTimeKind('clock')} aria-pressed={timeKind === 'clock'} className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${timeKind === 'clock' ? 'bg-[#194f43] text-white' : 'bg-[#e9e3d8]'}`}>عند ساعة محددة</button>
        </div>
        {timeKind === 'duration' ? <>
          <div className="mb-3 flex items-center gap-3">
            <label htmlFor="samee3-sleep-minutes" className="min-w-fit text-sm font-bold">المدة بالدقائق</label>
            <input id="samee3-sleep-minutes" type="number" min={1} max={480} step={1} value={minutes} onChange={(event: ChangeEvent<HTMLInputElement>) => setMinutes(Number(event.target.value))} className="w-full rounded-xl border border-[#ded5c7] bg-white p-3 text-center text-base font-bold" />
          </div>
          <div className="mb-4 flex flex-wrap gap-2" aria-label="مدد مقترحة">
            {PRESETS.map(value => <button type="button" key={value} onClick={() => setMinutes(value)} className={`rounded-full border px-3 py-2 text-xs ${minutes === value ? 'border-[#194f43] bg-[#194f43] text-white' : 'border-[#ded5c7] bg-white'}`}>{value} د</button>)}
          </div>
        </> : <div className="mb-4 flex items-center gap-3">
          <label htmlFor="samee3-sleep-time" className="min-w-fit text-sm font-bold">موعد الإيقاف</label>
          <input id="samee3-sleep-time" type="time" value={clockTime} onChange={(event: ChangeEvent<HTMLInputElement>) => setClockTime(event.target.value)} className="w-full rounded-xl border border-[#ded5c7] bg-white p-3 text-center text-base font-bold" />
        </div>}
        {record && <p className="mb-3 rounded-xl bg-[#ecf1eb] p-3 text-sm" role="status">المؤقت الحالي: {timeLeft(remaining)} متبقية.</p>}
        {notice && <p role="status" className="mb-3 rounded-lg bg-[#e9f0e8] p-2 text-xs font-medium">{notice}</p>}
        <button type="button" onClick={start} className="w-full rounded-xl bg-[#194f43] px-4 py-3 font-extrabold text-white">{record ? 'تغيير المؤقت' : 'بدء المؤقت'}</button>
        {record && <button type="button" onClick={cancel} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-700"><TimerOff size={17}/> إلغاء المؤقت</button>}
        <p className="mt-3 text-[11px] leading-5 text-[#6b756b]">الإغلاق يعني الخروج للرئيسية، وليس قفل الهاتف. عند تعطيل المتصفح للصوت أو JavaScript في الخلفية قد يتأخر التنفيذ حتى عودة التطبيق.</p>
      </section>
    </div>}

  </>
}