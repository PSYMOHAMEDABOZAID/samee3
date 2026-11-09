'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Headphones, Loader2, Pause, Play, Repeat2, Volume2 } from 'lucide-react'
import { appAudio, useAppAudio } from '@/lib/app-audio'
import { readCachedAdhkar, loadAdhkarCatalog, findAdhkarCategory, type AdhkarCategory, type AdhkarDailyType } from '@/lib/adhkar-catalog'
import { findAdhkarCategoryRecording, findAdhkarRecording, getIndividualAdhkarAudio, listAdhkarReciters, makeAdhkarAudioUrl } from '@/lib/adhkar-reciters'
import { localAdhkarSectionUrl, localAdhkarSections } from '@/lib/adhkar-local-audio'
import { parseAdhkarListening } from '@/lib/adhkar-listening'
import type { PlaybackTrack } from '@/lib/persistent-player'

type PlayStyle = 'full' | 'each'
const RECITER_KEY = 'samee3_adhkar_reciter'
const SETTINGS_KEY = 'samee3_adhkar_read_settings_v1'
const LABELS: Record<AdhkarDailyType, string> = {
  morning: 'أذكار الصباح', evening: 'أذكار المساء', sleep: 'أذكار النوم', waking: 'أذكار الاستيقاظ',
}

function readJson(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || 'null') as unknown } catch { return null }
}
function categoryAudioType(name: string, type: AdhkarDailyType, explicit: boolean): AdhkarDailyType | null {
  if (!explicit) return type
  if (name.includes('الصباح') && name.includes('المساء')) return type === 'evening' ? 'evening' : 'morning'
  if (name.includes('الصباح')) return 'morning'
  if (name.includes('المساء')) return 'evening'
  if (name.includes('النوم')) return 'sleep'
  if (name.includes('الاستيقاظ')) return 'waking'
  return null
}
function sameDay(value: number): boolean {
  if (!Number.isFinite(value)) return false
  const a = new Date(value), b = new Date()
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function savedCounts(category: AdhkarCategory, key: string, isDaily: boolean): Record<number, number> {
  const values: Record<number, number> = {}
  const snapshot = appAudio.getSnapshot()
  const active = snapshot.scope === 'adhkar' && snapshot.contextKey === key
  const stored = readJson(key)
  const saved = stored && typeof stored === 'object' ? stored as { counts?: unknown; savedAt?: unknown } : null
  const persisted = !isDaily || (typeof saved?.savedAt === 'number' && sameDay(saved.savedAt))
  const previous: Record<number, unknown> = active && Object.keys(snapshot.counts).length ? snapshot.counts
    : persisted && saved?.counts && typeof saved.counts === 'object' ? saved.counts as Record<number, unknown> : {}
  for (const item of category.array) {
    const count = Number(previous[item.id])
    values[item.id] = Number.isInteger(count) && count >= 0
      ? Math.min(item.count, count) : item.count
  }
  return values
}

export default function AdhkarQuickPlayModes() {
  const params = useSearchParams()
  const playback = useAppAudio()
  const categoryIdValue = Number(params.get('categoryId') || 0)
  const categoryId = Number.isInteger(categoryIdValue) && categoryIdValue > 0 ? categoryIdValue : 0
  const rawType = params.get('type')
  const type: AdhkarDailyType = rawType === 'evening' || rawType === 'sleep' || rawType === 'waking' ? rawType : 'morning'
  const requestedReciter = params.get('reciter') || ''
  const progressKey = `samee3_adhkar_progress_v2_${categoryId || type}`
  const [category, setCategory] = useState<AdhkarCategory | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [readerId, setReaderId] = useState(requestedReciter)
  const [lastRequestedStyle, setLastRequestedStyle] = useState<PlayStyle | null>(null)
  const lastStartedQueue = useRef<PlaybackTrack[] | null>(null)

  useEffect(() => {
    let disposed = false
    const controller = new AbortController()
    setCategory(null)
    setLoading(true)
    const run = async () => {
      try {
        const cached = await readCachedAdhkar()
        if (disposed) return
        const find = (items: AdhkarCategory[]) => categoryId
          ? items.find(entry => entry.id === categoryId) || null
          : findAdhkarCategory(items, type)
        if (cached?.length) setCategory(find(cached))
        const data = await loadAdhkarCatalog({ refresh: false, signal: controller.signal })
        if (!disposed) setCategory(find(data.categories))
      } catch {
        if (!disposed) setMessage('افتح الأذكار أثناء الاتصال مرة واحدة لتجهيز التسجيلات.')
      } finally { if (!disposed) setLoading(false) }
    }
    void run()
    return () => { disposed = true; controller.abort() }
  }, [categoryId, type])

  useEffect(() => { setReaderId(requestedReciter); setLastRequestedStyle(null) }, [requestedReciter, progressKey])
  // The existing ReaderPicker saves to localStorage in this same tab.
  // Read the choice after its click handler, without modifying that component.
  useEffect(() => {
    const update = () => {
      try {
        const saved = localStorage.getItem(RECITER_KEY) || ''
        if (saved) setReaderId(old => old === saved ? old : saved)
      } catch { /* private-mode storage */ }
    }
    const onClick = () => window.requestAnimationFrame(update)
    document.addEventListener('click', onClick)
    window.addEventListener('focus', update)
    window.addEventListener('storage', update)
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('focus', update)
      window.removeEventListener('storage', update)
    }
  }, [])

  const resolveReader = useCallback(() => {
    const fromPlayback = appAudio.getSnapshot()
    const activeReader = fromPlayback.scope === 'adhkar' && fromPlayback.contextKey === progressKey ? fromPlayback.readerId : ''
    let saved = ''
    try { saved = localStorage.getItem(RECITER_KEY) || '' } catch { /* optional storage */ }
    const list = listAdhkarReciters({ hasIndividualAudio: true })
    const kind = category ? categoryAudioType(category.category, type, Boolean(categoryId)) : null
    const eligible = category ? list.filter(reader => Boolean(
      (kind ? findAdhkarRecording(reader.id, kind, { allowCombined: true })
        : findAdhkarCategoryRecording(reader.id, category.id)) ||
      category.array.some(item => getIndividualAdhkarAudio(reader.id, item, kind || undefined))
    )) : list
    const preferred = activeReader || readerId || requestedReciter || saved
    return eligible.find(item => item.id === preferred) || eligible.find(item => item.id === requestedReciter) || eligible[0] || null
  }, [progressKey, readerId, requestedReciter, category, categoryId, type])

  const audioType = category ? categoryAudioType(category.category, type, Boolean(categoryId)) : null
  const reciter = resolveReader()
  const section = reciter && category ? (audioType
    ? findAdhkarRecording(reciter.id, audioType, { allowCombined: true })
    : findAdhkarCategoryRecording(reciter.id, category.id)) : null
  const sectionUrl = section ? makeAdhkarAudioUrl(section.url) : null
  const itemTracks = useMemo(() => category && reciter ? category.array.map((item, index) => ({
    item, index, url: getIndividualAdhkarAudio(reciter.id, item, audioType || undefined),
  })).filter(entry => Boolean(entry.url)) : [], [category, reciter, audioType])
  const isOwnAudio = playback.scope === 'adhkar' && playback.contextKey === progressKey
  const current = isOwnAudio ? playback.queue[playback.index] : undefined
  const currentStyle: PlayStyle | null = current ?
    (playback.queue === lastStartedQueue.current ? lastRequestedStyle : null) || (current.itemId === undefined ? 'full' : 'each') : null

  const start = (style: PlayStyle) => {
    setMessage('')
    if (!category || !reciter) { setMessage('لم يكتمل تجهيز الأذكار أو بيانات القارئ.'); return }
    if (isOwnAudio && currentStyle === style && (playback.playing || playback.loading)) {
      appAudio.toggle()
      return
    }
    if (isOwnAudio && currentStyle === style && !playback.playing && !playback.loading && current && !appAudio.element()?.ended) {
      appAudio.toggle()
      return
    }
    const counts = savedCounts(category, progressKey, !categoryId && (type === 'morning' || type === 'evening'))
    const settings = parseAdhkarListening(readJson(SETTINGS_KEY))
    const repetitions = settings.listeningMode === 'once' ? 1 : settings.listeningMode === 'custom' ? settings.customRepeats : undefined
    let queue: PlaybackTrack[] = []
    if (style === 'full' && sectionUrl) {
      const local = localAdhkarSections(reciter.id).find(entry => entry.url === (localAdhkarSectionUrl(sectionUrl) || sectionUrl))
      queue = [{ url: sectionUrl, title: category.category || LABELS[type], subtitle: reciter.name,
        listenRepeats: 1, adhkar: { section: category.category || LABELS[type], recordingId: local?.id } }]
    } else {
      queue = itemTracks.filter(({ item }) => repetitions !== undefined || counts[item.id] > 0)
        .map(({ item, index, url }): PlaybackTrack => ({
          url: url!, title: `${category.category} · الذكر ${(index + 1).toLocaleString('ar-EG')}`,
          subtitle: reciter.name, itemId: item.id, repetitions: item.count, repeatRemaining: true,
          listenRepeats: repetitions,
          adhkar: { section: category.category, text: item.text, number: index + 1, total: category.array.length },
        }))
      if (style === 'full' && !sectionUrl && queue.length) setMessage('لا يوجد تسجيل واحد للورد عند هذا القارئ؛ سيُشغَّل الورد من التسجيلات الفردية المتاحة.')
    }
    if (!queue.length) {
      setMessage(style === 'each'
        ? 'لا توجد تسجيلات فردية متاحة لهذا القارئ أو اكتمل عدد الاستماع. اختر قارئًا مناسبًا أو أعد عدادات الورد.'
        : 'لا يوجد تسجيل للورد عند هذا القارئ. اختر قارئًا لديه تسجيل صوتي.')
      return
    }
    lastStartedQueue.current = queue
    setLastRequestedStyle(style)
    appAudio.start({ scope: 'adhkar', contextKey: progressKey, readerId: reciter.id,
      href: `/adhkar/read?${categoryId ? `categoryId=${categoryId}` : `type=${type}`}&reciter=${encodeURIComponent(reciter.id)}`,
      queue, index: 0, counts, repeat: 'off' })
  }

  return (
    <section dir="rtl" aria-label="اختيار طريقة استماع الأذكار"
      className="mx-auto mb-3 w-full max-w-5xl overflow-hidden rounded-[24px] border border-[#e4d4b8] bg-[#fffdf9] p-3 text-[#1b4549] shadow-[0_8px_28px_rgba(21,63,60,0.09)] sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3ead8] text-[#95703a]"><Headphones size={19}/></span>
          <div><h2 className="text-sm font-black">ابدأ الاستماع لوردك</h2><p className="text-[11px] text-[#70827e]">اختر طريقة التشغيل المناسبة لك</p></div>
        </div>
        <span className="rounded-full bg-[#eef5f1] px-2.5 py-1 text-[10px] font-bold text-[#357064]">{category ? category.category : LABELS[type]}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <button type="button" disabled={loading || !category || (!sectionUrl && !itemTracks.length)} onClick={() => start('full')}
          aria-label="تشغيل الورد كاملًا" className={`flex min-h-[78px] items-center gap-2 rounded-2xl border px-2.5 py-3 text-right transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-45 sm:px-4 ${currentStyle === 'full' ? 'border-[#c4aa74] bg-[#e4efe7] ring-1 ring-[#8aab9b]' : 'border-[#d9e4db] bg-[#1b5a50] text-white'}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${currentStyle === 'full' ? 'bg-[#d5e6d9]' : 'bg-white/15'}`}>{currentStyle === 'full' && playback.playing ? <Pause size={20}/> : <Play size={20} fill="currentColor"/>}</span>
          <span className="min-w-0"><span className="block text-[12px] font-black sm:text-sm">تشغيل الورد كاملًا</span><span className={`mt-1 block text-[10px] leading-4 ${currentStyle === 'full' ? 'text-[#557468]' : 'text-white/75'}`}>تسجيل كامل أو تشغيل متتابع</span></span>
        </button>
        <button type="button" disabled={loading || !category || !itemTracks.length} onClick={() => start('each')}
          aria-label="تشغيل ذكرًا بذكر" className={`flex min-h-[78px] items-center gap-2 rounded-2xl border px-2.5 py-3 text-right transition active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-45 sm:px-4 ${currentStyle === 'each' ? 'border-[#c4aa74] bg-[#e4efe7] ring-1 ring-[#8aab9b]' : 'border-[#e4d4b8] bg-[#f8f1e5]'}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e6d5b4]/70 text-[#896639]">{currentStyle === 'each' && playback.playing ? <Pause size={20}/> : <Repeat2 size={20}/>}</span>
          <span className="min-w-0"><span className="block text-[12px] font-black sm:text-sm">تشغيل ذكرًا بذكر</span><span className="mt-1 block text-[10px] leading-4 text-[#776b58]">بتكراره ثم الذكر التالي تلقائيًا</span></span>
        </button>
      </div>
      {loading && <p className="mt-2 flex items-center gap-2 text-[11px] text-[#76847e]"><Loader2 size={13} className="animate-spin"/> جارٍ تجهيز مصادر الأذكار...</p>}
      {section?.kind === 'combined-section' && <p className="mt-2 text-[11px] leading-5 text-[#856a43]">ملحوظة: التسجيل الكامل المتاح لهذا القارئ يضم أذكار الصباح والمساء معًا.</p>}
      {message && <p role="status" className="mt-3 rounded-xl bg-[#f6efe1] px-3 py-2 text-xs leading-6 text-[#755f35]">{message}</p>}
      {isOwnAudio && (playback.playing || playback.loading) && <p role="status" className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-[#326e61]"><Volume2 size={13}/> الاستماع جارٍ · اضغط نفس الاختيار للإيقاف المؤقت</p>}
      {!itemTracks.length && !loading && <p className="mt-2 text-[11px] leading-5 text-[#8c7965]">التشغيل ذكرًا بذكر يتطلب ملفات فردية لهذا القارئ؛ يمكنك اختيار قارئ آخر من صفحة الورد.</p>}
    </section>
  )
}