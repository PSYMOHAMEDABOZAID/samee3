'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, Check, Clock3, Download, ExternalLink, Headphones, Loader2, Pause, Play, Repeat2, Search, Volume2, X } from 'lucide-react'
import { appAudio, useAppAudio } from '@/lib/app-audio'
import { localAdhkarReaders, localAdhkarSections, type LocalAdhkarSection } from '@/lib/adhkar-local-audio'
import { downloadAdhkarForOffline } from '@/lib/adhkar-offline'
import { prepareAdhkarMedia } from '@/lib/quran/media-session'
import { ADHKAR_RECORDING_TYPES, filterCompleteAdhkar, recordingDuration, recordingPlaybackTracks, type RecordingType } from '@/lib/adhkar-recordings'

const readers = localAdhkarReaders().filter(reader => reader.sectionAudioCount > 0)
const recordings = localAdhkarSections()
const names = Object.fromEntries(readers.map(reader => [reader.id, reader.name]))
const number = (value: number) => value.toLocaleString('ar-EG')
const field = 'min-h-14 w-full min-w-0 rounded-2xl border border-[#e2d8c8] bg-white px-4 text-sm outline-none focus:border-[#a58a54] focus:ring-2 focus:ring-[#a58a54]/15'

function RecordingQuerySync({ onChange }: { onChange: (reader: string) => void }) {
  const search = useSearchParams(), requested = search.get('reciter') || ''
  useEffect(() => { onChange(readers.some(reader => reader.id === requested) ? requested : '') }, [requested, onChange])
  return null
}

function RecordingsContent() {
  const [reader, setReader] = useState(''), [query, setQuery] = useState('')
  const [type, setType] = useState<RecordingType>('all'), [limit, setLimit] = useState(24)
  const [busy, setBusy] = useState(''), [progress, setProgress] = useState(0), [message, setMessage] = useState('')
  const [saved, setSaved] = useState<Set<string>>(() => new Set())
  const controller = useRef<AbortController | null>(null), playback = useAppAudio()
  const current = playback.scope === 'adhkar' ? playback.queue[playback.index] : undefined
  const filtered = useMemo(() => filterCompleteAdhkar(recordings, names, reader, type, query), [reader, type, query])
  const availableTypes = useMemo(() => ADHKAR_RECORDING_TYPES.filter(([id]) => id === 'all' || recordings.some(row => row.type === id && (!reader || row.readerId === reader))), [reader])
  const chosenReader = readers.find(row => row.id === reader)
  const busyRecording = recordings.find(row => row.id === busy)
  useEffect(() => setLimit(24), [query, reader, type])
  useEffect(() => { if (!availableTypes.some(([id]) => id === type)) setType('all') }, [availableTypes, type])
  useEffect(() => () => controller.current?.abort(), [])

  const play = (recording: LocalAdhkarSection, forceQueue = false) => {
    if (!forceQueue && current?.url === recording.url) { appAudio.toggle(); return }
    setMessage('')
    appAudio.start({ scope: 'adhkar', contextKey: 'adhkar-recordings', readerId: recording.readerId,
      href: '/adhkar/recordings' + (reader ? '?reciter=' + encodeURIComponent(reader) : ''),
      index: filtered.findIndex(row => row.id === recording.id), queue: recordingPlaybackTracks(filtered, names) })
  }
  const save = async (recording: LocalAdhkarSection) => {
    if (controller.current) return
    const abort = new AbortController()
    controller.current = abort; setBusy(recording.id); setProgress(0); setMessage('')
    try {
      await Promise.all([
        downloadAdhkarForOffline(recording.url, abort.signal, (loaded, total) => { if (total) setProgress(Math.min(99, Math.round(loaded / total * 100))) }),
        prepareAdhkarMedia(recording.id, abort.signal).catch(() => undefined),
      ])
      setSaved(previous => new Set([...previous, recording.id])); setProgress(100)
      setMessage('تم حفظ التسجيل على هذا الجهاز للاستماع دون إنترنت.')
    } catch (error) {
      setMessage(abort.signal.aborted ? 'تم إيقاف التنزيل.' : error instanceof Error && error.name === 'QuotaExceededError'
        ? 'مساحة الحفظ على الجهاز غير كافية. أفرغ بعض المساحة وأعد المحاولة.' : 'تعذر تنزيل التسجيل. تحقق من الاتصال وأعد المحاولة.')
    } finally { controller.current = null; setBusy('') }
  }

  return <main dir="rtl" className="min-h-screen bg-[#f8f6f1] px-4 pb-52 pt-5 text-[#1f4540] sm:px-6 sm:pt-8">
    <Suspense fallback={null}><RecordingQuerySync onChange={setReader}/></Suspense>
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/adhkar" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#e2d8c8] bg-white px-4 text-sm font-bold transition hover:border-[#aa8c56]"><ArrowRight size={17}/>الأذكار</Link>
        <span className="flex items-center gap-2 text-xs font-bold text-[#9a7a43]"><Headphones size={16}/>مكتبة سميع المسموعة</span>
      </div>
      <header className="relative isolate overflow-hidden rounded-[32px] bg-[#153e37] px-6 py-8 text-white shadow-[0_18px_50px_#153e3718] sm:px-10 sm:py-11">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-28 h-80 w-80 rounded-full border-[36px] border-white/[0.025]"/>
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 left-12 h-80 w-80 rounded-full border border-[#e3c58e]/15"/>
        <div className="relative flex flex-col justify-between gap-8 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#d8c18f]/25 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-[#e5d1aa]"><span className="h-1.5 w-1.5 rounded-full bg-[#d5b47b]"/>وقتٌ يطمئنّ فيه القلب</span>
            <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">الأذكار الكاملة</h1>
            <p className="mt-3 max-w-lg text-sm leading-8 text-[#d5e1d9]">اختر صوتك المفضّل، واستمع إلى وردك بهدوء. تسجيلات كاملة يمكنك متابعتها أثناء التنقّل أو حفظها للاستماع دون إنترنت.</p>
            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-[#e0d0af]">
              <span><strong className="ml-1 text-lg text-white">{number(recordings.length)}</strong>تسجيلًا كاملًا</span>
              <span><strong className="ml-1 text-lg text-white">{number(readers.length)}</strong>قارئًا</span>
              <span className="inline-flex items-center gap-1.5"><Volume2 size={15}/>تشغيل مستمر</span>
            </div>
          </div>
          <div aria-hidden="true" className="hidden h-32 w-32 shrink-0 items-center justify-center rounded-full border border-[#d7bd86]/30 bg-white/[0.035] shadow-[0_0_0_16px_#ffffff03] sm:flex"><Headphones size={52} strokeWidth={1.2} className="text-[#dfc58f]"/></div>
        </div>
      </header>

      <section aria-label="اختيار التسجيلات" className="relative z-10 mx-0 mt-5 rounded-[26px] border border-[#e4dccf] bg-[#fffdfa] p-4 shadow-sm sm:mx-5 sm:-mt-5 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <label className="grid gap-2 text-xs font-bold text-[#66786b]">صوت القارئ
            <select aria-label="القارئ" value={reader} onChange={event => setReader(event.target.value)} className={field}>
              <option value="">كل القراء</option>{readers.map(row => <option key={row.id} value={row.id}>{row.name} — {number(row.sectionAudioCount)} تسجيلات</option>)}
            </select>
          </label>
          <label className="grid gap-2 text-xs font-bold text-[#66786b]">ابحث عمّا تحب سماعه
            <span className="flex min-h-14 items-center gap-2 rounded-2xl border border-[#e2d8c8] bg-white px-4 focus-within:border-[#a58a54]"><Search size={18} className="shrink-0 text-[#a58a54]"/>
              <input aria-label="ابحث في التسجيلات" value={query} onChange={event => setQuery(event.target.value)} placeholder="اسم القارئ، أذكار الصباح، النوم…" className="min-h-14 min-w-0 flex-1 bg-transparent text-sm font-normal text-[#1f4540] outline-none"/>
              {query && <button type="button" onClick={() => setQuery('')} aria-label="مسح البحث" className="rounded-full p-2"><X size={16}/></button>}
            </span>
          </label>
        </div>
        <div aria-label="أبواب التسجيلات" className="mt-4 flex gap-2 overflow-x-auto pb-1">{availableTypes.map(([id, label]) => <button type="button" key={id} aria-pressed={type === id} onClick={() => setType(id)} className={`min-h-10 shrink-0 rounded-full px-4 text-xs font-bold transition ${type === id ? 'bg-[#214e40] text-white' : 'bg-[#f1ede4] text-[#637163] hover:bg-[#e9e1d1]'}`}>{label}</button>)}</div>
      </section>

      <div className="mb-4 mt-8 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[11px] font-bold text-[#a58a54]">استمع على مهل</p><h2 className="mt-1 text-lg font-extrabold">{chosenReader ? 'بصوت ' + chosenReader.name : 'تسجيلات لجميع الأوقات'}</h2><p className="mt-1 text-xs text-[#7a8478]">{number(filtered.length)} تسجيلًا مطابقًا لاختيارك</p></div>
        {filtered.length > 0 && <button type="button" onClick={() => play(filtered[0], true)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#e9dfcb] px-5 text-xs font-bold text-[#5f4a2b] transition hover:bg-[#e1d1b1]"><Play size={14} fill="currentColor"/>تشغيل النتائج</button>}
      </div>
      {message && <p role="status" className="mb-4 rounded-2xl border border-[#d8dfd0] bg-[#f0f5eb] p-4 text-sm leading-7">{message}</p>}
      {busy && <div role="status" aria-live="polite" className="mb-5 rounded-2xl border border-[#ded3bf] bg-white p-4">
        <div className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2"><Loader2 size={15} className="animate-spin"/>حفظ {busyRecording?.title} · {number(progress)}٪</span><button type="button" onClick={() => controller.current?.abort()} className="min-h-10 px-2 font-bold text-red-700">إيقاف التنزيل</button></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f0ebe1]"><div className="h-full rounded-full bg-[#a58a54] transition-[width]" style={{ width: progress + '%' }}/></div>
      </div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.slice(0, limit).map((recording, index) => {
        const selected = current?.url === recording.url, playing = selected && playback.playing, loading = selected && playback.loading
        const typeLabel = ADHKAR_RECORDING_TYPES.find(([id]) => id === recording.type)?.[1] || 'أذكار'
        return <article key={recording.id} className={`group relative overflow-hidden rounded-[26px] border bg-white p-5 transition-shadow hover:shadow-md ${selected ? 'border-[#b99c64] shadow-[0_4px_25px_#b99c6419]' : 'border-[#e5dfd3] shadow-[0_3px_12px_#27422e04]'}`}>
          <div className="flex items-start justify-between gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${selected ? 'bg-[#214e40] text-[#e2cc9f]' : 'bg-[#f3eee3] text-[#aa8a52]'}`}><Headphones size={23} strokeWidth={1.5}/></span>
            <span className="rounded-full bg-[#f7f5f0] px-2.5 py-1 text-[10px] text-[#8a8b7c]">{typeLabel}</span>
          </div>
          <p className="mt-4 text-xs font-medium text-[#7f8a7d]">{names[recording.readerId]}</p>
          <h3 className="mt-1.5 min-h-12 text-base font-extrabold leading-7 text-[#244b3e]">{recording.title}</h3>
          <div className="mt-3 flex items-center gap-3 text-[11px] text-[#8c9184]"><span className="inline-flex items-center gap-1"><Clock3 size={13}/><span dir="ltr" className="tabular-nums">{recordingDuration(recording.durationMs)}</span></span><span>تسجيل كامل</span>{saved.has(recording.id) && <span className="inline-flex items-center gap-1 text-[#49714d]"><Check size={12}/>محفوظ</span>}</div>
          <div className="mt-5 flex items-center gap-2">
            <button type="button" onClick={() => play(recording)} aria-label={(loading ? 'إيقاف تحميل: ' : playing ? 'إيقاف مؤقت: ' : 'تشغيل: ') + recording.title + ' — ' + names[recording.readerId]}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition ${selected ? 'bg-[#214e40] text-white' : 'bg-[#f0f4ed] text-[#356143] hover:bg-[#e4eddf]'}`}>
              {loading ? <Loader2 size={16} className="animate-spin"/> : playing ? <Pause size={16} fill="currentColor"/> : <Play size={15} fill="currentColor"/>}{loading ? 'جارٍ التجهيز' : playing ? 'إيقاف مؤقت' : selected ? 'متابعة الاستماع' : 'استماع'}
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void save(recording)} aria-label={'حفظ دون إنترنت: ' + recording.title} title="حفظ دون إنترنت" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[#e5dfd3] text-[#9d8350] transition hover:bg-[#f8f4eb] disabled:opacity-40"><Download size={17}/></button>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#f0ece4] pt-3 text-[10px] text-[#92968a]"><a download href={recording.url} className="min-h-8 py-2 underline decoration-[#cec5b3] underline-offset-4">تحميل MP3</a><a href={recording.sourcePage} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 py-2">المصدر<ExternalLink size={11}/></a><span aria-hidden="true" className="text-[#d1c7b5]">{number(index + 1).padStart(2, '٠')}</span></div>
        </article>
      })}</div>
      {!filtered.length && <div className="rounded-[28px] border border-dashed border-[#d8cebb] bg-[#fffdfa] px-5 py-14 text-center"><Search size={27} className="mx-auto text-[#b6a27b]"/><h3 className="mt-4 font-bold">لم نجد تسجيلًا بهذا الاختيار</h3><p className="mt-2 text-sm text-[#84907f]">جرّب اسم قارئ آخر، أو افتح جميع أبواب التسجيلات.</p><button type="button" onClick={() => { setQuery(''); setReader(''); setType('all') }} className="mt-5 min-h-11 rounded-full bg-[#eae2d1] px-5 text-xs font-bold">عرض كل التسجيلات</button></div>}
      {filtered.length > limit && <button type="button" onClick={() => setLimit(previous => previous + 24)} className="mt-6 min-h-12 w-full rounded-2xl border border-[#ded4bf] bg-[#fffdfa] text-sm font-bold">عرض المزيد · {number(filtered.length - limit)} تسجيلًا</button>}
      {playback.scope === 'adhkar' && current && <div className="mt-7 flex flex-wrap items-center gap-3 rounded-2xl border border-[#e3dbc9] bg-[#f1ede3] p-4 text-xs"><Repeat2 size={17} className="text-[#a08752]"/><span className="font-bold">خيارات الاستماع</span>{([['one', 'تكرار التسجيل'], ['all', 'تكرار القائمة']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={playback.repeat === value} onClick={() => appAudio.settings({ repeat: playback.repeat === value ? 'off' : value })} className={`min-h-10 rounded-full px-4 ${playback.repeat === value ? 'bg-[#214e40] text-white' : 'border border-[#d7cdb8] bg-white'}`}>{label}</button>)}</div>}
      <p className="mx-auto mt-7 max-w-2xl text-center text-[11px] leading-7 text-[#92998c]">متابعة الاستماع متاحة أثناء التنقّل داخل سميع. عرض نص الذكر في مشغّل الجهاز يعتمد على دعم الجهاز والتوقيتات المتاحة للتسجيل.</p>
    </div>
  </main>
}

export default function CompleteRecordings() {
  return <Suspense fallback={<div dir="rtl" className="min-h-screen bg-[#f8f6f1] p-10 text-center text-sm text-[#53735c]">جارٍ فتح مكتبة الأذكار…</div>}><RecordingsContent/></Suspense>
}
