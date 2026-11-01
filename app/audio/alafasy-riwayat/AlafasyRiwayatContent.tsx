'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, BookOpen, Check, ChevronLeft, ChevronRight, Download, Headphones, Loader2, Pause, Play, RotateCcw, Search, SkipBack, SkipForward, Trash2, WifiOff } from 'lucide-react'

type Edition = {
  id: string
  name: string
  source: string
  sourceUrl: string
  server: string
  surahIds: number[]
}
type Catalog = { reciter: string; editions: Edition[] }
type NowPlaying = { editionId: string; surah: number; url: string; offline: boolean }

const CATALOG_KEY = 'samee3-riwayat-catalog-v4'
const AUDIO_CACHE = 'samee3-riwayat-audio-v1' // Reuse files saved by the earlier player.
const PROGRESS_KEY = 'samee3-alafasy-playback-v2'
const NAMES = 'الفاتحة,البقرة,آل عمران,النساء,المائدة,الأنعام,الأعراف,الأنفال,التوبة,يونس,هود,يوسف,الرعد,إبراهيم,الحجر,النحل,الإسراء,الكهف,مريم,طه,الأنبياء,الحج,المؤمنون,النور,الفرقان,الشعراء,النمل,القصص,العنكبوت,الروم,لقمان,السجدة,الأحزاب,سبأ,فاطر,يس,الصافات,ص,الزمر,غافر,فصلت,الشورى,الزخرف,الدخان,الجاثية,الأحقاف,محمد,الفتح,الحجرات,ق,الذاريات,الطور,النجم,القمر,الرحمن,الواقعة,الحديد,المجادلة,الحشر,الممتحنة,الصف,الجمعة,المنافقون,التغابن,الطلاق,التحريم,الملك,القلم,الحاقة,المعارج,نوح,الجن,المزمل,المدثر,القيامة,الإنسان,المرسلات,النبأ,النازعات,عبس,التكوير,الانفطار,المطففين,الانشقاق,البروج,الطارق,الأعلى,الغاشية,الفجر,البلد,الشمس,الليل,الضحى,الشرح,التين,العلق,القدر,البينة,الزلزلة,العاديات,القارعة,التكاثر,العصر,الهمزة,الفيل,قريش,الماعون,الكوثر,الكافرون,النصر,المسد,الإخلاص,الفلق,الناس'.split(',')
const name = (surah: number) => NAMES[surah - 1] || `السورة ${surah}`
const fileKey = (id: string, surah: number) => `/audio/alafasy-riwayat/offline/${encodeURIComponent(id)}/${String(surah).padStart(3, '0')}.mp3`
const streamUrl = (id: string, surah: number, download = false) => `/api/alafasy-riwayat?stream=${encodeURIComponent(id)}&surah=${surah}${download ? '&download=1' : ''}`
const fmt = (seconds: number) => Number.isFinite(seconds) && seconds >= 0 ? `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}` : '00:00'
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'حدث خطأ أثناء تشغيل التلاوة.'

function isCatalog(value: unknown): value is Catalog {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<Catalog>
  return typeof data.reciter === 'string' && Array.isArray(data.editions) && data.editions.every(item =>
    typeof item.id === 'string' && typeof item.name === 'string' && typeof item.sourceUrl === 'string' && Array.isArray(item.surahIds) && item.surahIds.every(n => Number.isInteger(n) && n >= 1 && n <= 114)
  )
}

export default function AlafasyRiwayatContent({ embedded = false }: { embedded?: boolean }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [editionId, setEditionId] = useState('')
  const [search, setSearch] = useState('')
  const [playing, setPlaying] = useState<NowPlaying | null>(null)
  const [paused, setPaused] = useState(true)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [saved, setSaved] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectRef = useRef<string | null>(null)
  const playingRef = useRef<NowPlaying | null>(null)
  const editionsRef = useRef<Edition[]>([])
  const lastSavedSecond = useRef(-1)

  const edition = useMemo(() => catalog?.editions.find(row => row.id === editionId) || catalog?.editions[0] || null, [catalog, editionId])
  const rows = useMemo(() => (edition?.surahIds || []).filter(n => !search.trim() || `${n}`.includes(search.trim()) || name(n).includes(search.trim())), [edition, search])
  const currentEdition = useMemo(() => catalog?.editions.find(row => row.id === playing?.editionId), [catalog, playing])

  const refreshSaved = useCallback(async () => {
    if (!('caches' in window)) return
    try {
      const cache = await caches.open(AUDIO_CACHE)
      const keys = await cache.keys()
      setSaved(keys.map(request => new URL(request.url).pathname))
    } catch { /* Browser may deny storage in private mode. */ }
  }, [])

  useEffect(() => {
    let mounted = true
    try {
      const previous: unknown = JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null')
      if (isCatalog(previous)) setCatalog(previous)
    } catch { /* Private browsing. */ }
    void fetch('/api/alafasy-riwayat', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('تعذر تحميل قائمة الروايات من المصادر.')
      return response.json() as Promise<unknown>
    }).then(result => {
      if (!mounted || !isCatalog(result)) throw new Error('بيانات قائمة الروايات غير صالحة.')
      setCatalog(result)
      try { localStorage.setItem(CATALOG_KEY, JSON.stringify(result)) } catch { /* quota */ }
    }).catch(err => { if (mounted) setNotice(errorMessage(err)) })
    void refreshSaved()
    return () => {
      mounted = false
      audioRef.current?.pause()
      if (objectRef.current) URL.revokeObjectURL(objectRef.current)
    }
  }, [refreshSaved])

  useEffect(() => { editionsRef.current = catalog?.editions || [] }, [catalog])

  function remember(next: NowPlaying | null, seconds: number) {
    if (!next) return
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify({ editionId: next.editionId, surah: next.surah, seconds })) } catch { /* quota */ }
  }

  function onTimeUpdate() {
    const audio = audioRef.current
    if (!audio) return
    setPosition(audio.currentTime)
    if (Math.floor(audio.currentTime / 5) !== lastSavedSecond.current) {
      lastSavedSecond.current = Math.floor(audio.currentTime / 5)
      remember(playingRef.current, audio.currentTime)
    }
  }

  function attachAudio(item: NowPlaying, resume = false) {
    const audio = audioRef.current
    if (!audio) return
    // Same-origin streaming starts immediately, within the actual user click.
    // This avoids losing the user gesture on iOS while awaiting an API response.
    audio.pause()
    if (objectRef.current && objectRef.current !== item.url) {
      URL.revokeObjectURL(objectRef.current)
      objectRef.current = null
    }
    playingRef.current = item
    setPlaying(item)
    setPosition(0)
    setDuration(0)
    setPaused(false)
    setNotice('')
    audio.src = item.url
    audio.playbackRate = speed
    audio.load()
    if (resume) {
      try {
        const state = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null') as {editionId?: string; surah?: number; seconds?: number} | null
        if (state?.editionId === item.editionId && state?.surah === item.surah && typeof state.seconds === 'number' && Number.isFinite(state.seconds) && state.seconds > 0) {
          const checkpoint = Number(state.seconds)
          audio.addEventListener('loadedmetadata', () => { if (Number.isFinite(audio.duration) && checkpoint < audio.duration - 2) audio.currentTime = checkpoint }, { once: true })
        }
      } catch { /* progress optional */ }
    }
    const promise = audio.play()
    void promise.catch(() => {
      setPaused(true)
      setNotice('اضغط زر التشغيل في المشغل للاستماع. قد يحتاج iPhone إلى ضغطة إضافية بعد اختيار المصدر.')
    })
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: `سورة ${name(item.surah)}`, artist: 'مشاري راشد العفاسي', album: editionsRef.current.find(row => row.id === item.editionId)?.name || 'مصحف الروايات' }) } catch { /* optional */ }
    }
  }

  function play(id: string, surah: number) {
    const audio = audioRef.current
    if (playingRef.current?.editionId === id && playingRef.current?.surah === surah && audio) {
      if (!audio.paused) { audio.pause(); setPaused(true); return }
      void audio.play().then(() => setPaused(false)).catch(() => setNotice('تعذر استئناف التشغيل، افتح رابط المصدر إذا استمرت المشكلة.'))
      return
    }
    if (!navigator.onLine) {
      // Offline requires loading the cached object URL; audio controls remain available if iOS denies autoplay.
      void (async () => {
        try {
          if (!('caches' in window)) throw new Error('الحفظ دون إنترنت غير مدعوم على جهازك.')
          const cache = await caches.open(AUDIO_CACHE)
          const entry = await cache.match(fileKey(id, surah))
          if (!entry) throw new Error('السورة غير محفوظة على هذا الجهاز. حمّلها وأنت متصل بالإنترنت.')
          const blob = await entry.blob()
          const url = URL.createObjectURL(blob)
          objectRef.current = url
          attachAudio({editionId: id, surah, url, offline: true}, true)
        } catch (e) { setNotice(errorMessage(e)) }
      })()
      return
    }
    attachAudio({editionId: id, surah, url: streamUrl(id, surah), offline: false}, true)
  }

  function adjacent(direction: -1 | 1) {
    const current = playingRef.current
    const row = editionsRef.current.find(x => x.id === current?.editionId)
    if (!row || !current) return
    const index = row.surahIds.indexOf(current.surah)
    const next = row.surahIds[index + direction]
    if (next) play(row.id, next)
  }

  async function saveOffline(id: string, surah: number) {
    const key = fileKey(id, surah)
    setBusy(key)
    setNotice('')
    try {
      if (!('caches' in window)) throw new Error('الحفظ دون إنترنت غير مدعوم على هذا المتصفح.')
      const cache = await caches.open(AUDIO_CACHE)
      if (await cache.match(key)) { setNotice('السورة محفوظة بالفعل دون إنترنت.'); return }
      if (!navigator.onLine) throw new Error('اتصل بالإنترنت لتنزيل السورة أول مرة.')
      const response = await fetch(streamUrl(id, surah), { cache: 'no-store' })
      if (!response.ok || !(response.headers.get('content-type') || '').includes('audio')) {
        await response.body?.cancel().catch(() => {})
        throw new Error('لم يقدّم المصدر ملفًا صوتيًا صالحًا للحفظ.')
      }
      // Cache API streams directly rather than loading whole large MP3 into JS memory.
      await cache.put(key, response)
      await refreshSaved()
      setNotice('تم حفظ السورة في سميع للاستماع دون إنترنت على هذا الجهاز.')
    } catch (e) { setNotice(`${errorMessage(e)} قد تكون مساحة الجهاز غير كافية.`) }
    finally { setBusy('') }
  }

  function saveToDevice(id: string, surah: number) {
    if (!navigator.onLine && !saved.includes(fileKey(id, surah))) { setNotice('يلزم اتصال بالإنترنت أو ملف محفوظ أولًا.'); return }
    // Let the browser stream the download: no Blob/Memory overhead for long surahs.
    if (navigator.onLine) {
      const a = document.createElement('a')
      a.href = streamUrl(id, surah, true)
      a.download = `Alafasy-${id}-${String(surah).padStart(3, '0')}.mp3`
      document.body.appendChild(a); a.click(); a.remove()
      setNotice('بدأ تنزيل الملف. على iPhone اختر «حفظ في الملفات» إذا ظهرت قائمة المشاركة.')
    } else {
      void (async () => {
        try {
          const cache = await caches.open(AUDIO_CACHE)
          const entry = await cache.match(fileKey(id, surah))
          if (!entry) throw new Error('الملف غير موجود محليًا.')
          const url = URL.createObjectURL(await entry.blob())
          const a = document.createElement('a')
          a.href = url; a.download = `Alafasy-${id}-${String(surah).padStart(3, '0')}.mp3`
          document.body.appendChild(a); a.click(); a.remove()
          window.setTimeout(() => URL.revokeObjectURL(url), 45000)
        } catch(e) { setNotice(errorMessage(e)) }
      })()
    }
  }

  async function removeOffline(id: string, surah: number) {
    try {
      const cache = await caches.open(AUDIO_CACHE)
      await cache.delete(fileKey(id, surah))
      await refreshSaved()
      setNotice('تم حذف النسخة المحفوظة على الجهاز فقط.')
    } catch { setNotice('تعذر حذف النسخة المحفوظة.') }
  }

  return (
    <section dir="rtl" className={`${embedded ? 'pb-6' : 'mx-auto min-h-screen max-w-5xl px-4 py-6'} space-y-4 text-slate-900 dark:text-slate-100`}>
      <div className="rounded-[30px] bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-700 p-5 text-white shadow-sm sm:p-7">
        <div className="flex items-center gap-2 text-emerald-200"><Headphones size={18} /><span className="text-sm">مصحف سميع • المكتبة الصوتية</span></div>
        <h2 className="mt-3 text-2xl font-bold leading-relaxed">مصحف روايات مشاري راشد العفاسي</h2>
        <p className="mt-1 text-sm leading-7 text-emerald-100">اختر الرواية والسورة واستمع من المشغل الموحد. التسجيلات الكاملة والجزئية مع الحفاظ على مصدر كل تلاوة.</p>
      </div>

      {notice && <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm leading-7 text-amber-900 dark:bg-amber-950 dark:text-amber-100">{notice} {currentEdition && <a className="font-semibold underline" href={currentEdition.sourceUrl} target="_blank" rel="noreferrer">فتح المصدر</a>}</div>}
      {!catalog && <div className="flex items-center gap-2 rounded-2xl border p-4"><Loader2 size={18} className="animate-spin" />جارٍ تحميل فهرس المصاحف...</div>}
      {catalog && <>
        <div className="text-sm text-slate-500 dark:text-slate-400">{catalog.editions.length} مصدر/إصدار متاح حاليًا • السور الظاهرة هي المتاحة لدى المصدر، وليست بالضرورة 114 سورة.</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {catalog.editions.map(item => <button key={item.id} type="button" aria-pressed={edition?.id === item.id} onClick={() => { setEditionId(item.id); setSearch('') }} className={`rounded-2xl border p-4 text-right transition ${edition?.id === item.id ? 'border-emerald-600 bg-emerald-700 text-white shadow-md' : 'border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900'}`}>
            <span className="block text-base font-bold">{item.name}</span>
            <span className="mt-1 block text-xs opacity-75">{item.source} • {item.surahIds.length} سورة {item.surahIds.length === 114 ? '• كامل' : '• متاح جزئيًا'}</span>
          </button>)}
        </div>
        {edition && <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xl font-bold">{edition.name}</h3><p className="mt-1 text-sm text-slate-500">{edition.source} — {edition.surahIds.length} تسجيلًا</p></div><a href={edition.sourceUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-emerald-700 underline dark:text-emerald-300">صفحة المصدر</a></div>
          <label className="mt-4 flex items-center gap-2 rounded-2xl border bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-800"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث باسم السورة أو رقمها" className="min-w-0 flex-1 bg-transparent py-3 outline-none" aria-label="البحث عن سورة"/></label>
          <div className="mt-3 max-h-[650px] space-y-2 overflow-y-auto pb-2">
            {rows.map(surah => { const key = fileKey(edition.id, surah); const active = playing?.editionId === edition.id && playing.surah === surah; const stored = saved.includes(key); return <div key={surah} className={`rounded-2xl border p-3 ${active ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950' : 'border-slate-200 dark:border-slate-700'}`}>
              <div className="mb-2 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><BookOpen size={18} className="text-emerald-700"/><span className="font-semibold">{surah}. {name(surah)}</span></div>{stored && <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300"><Check size={14}/> دون إنترنت</span>}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => play(edition.id, surah)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white">{active && !paused ? <Pause size={16}/> : <Play size={16}/>} {active && !paused ? 'إيقاف مؤقت' : 'استماع'}</button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void saveOffline(edition.id, surah)} className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm disabled:opacity-50">{busy === key ? <Loader2 size={16} className="animate-spin"/> : <WifiOff size={16}/>} {busy === key ? 'جارٍ الحفظ' : 'حفظ دون نت'}</button>
                <button type="button" onClick={() => saveToDevice(edition.id, surah)} className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm"><Download size={16}/> تنزيل MP3</button>
                {stored && <button type="button" title="حذف النسخة المحلية" aria-label={`حذف سورة ${name(surah)} المحفوظة`} onClick={() => void removeOffline(edition.id, surah)} className="rounded-lg p-2 text-red-700"><Trash2 size={17}/></button>}
              </div>
            </div>})}
            {!rows.length && <p className="py-5 text-center text-slate-500">لا توجد سور مطابقة لبحثك في هذه الرواية.</p>}
          </div>
        </div>}
      </>}

      {/* Keep the native audio element mounted: iOS needs .play() during the click gesture. */}
      <audio ref={audioRef} preload="none" onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)} onTimeUpdate={onTimeUpdate} onPlay={() => setPaused(false)} onPause={() => setPaused(true)} onEnded={() => { setPaused(true); adjacent(1) }} onError={() => { if (playingRef.current) setNotice('المصدر لم يرسل ملفًا صوتيًا قابلًا للتشغيل. جرّب سورة أخرى أو افتح صفحة المصدر.'); setPaused(true) }} />
      {playing && <div className={`sticky ${embedded ? 'bottom-20' : 'bottom-3'} z-30 rounded-3xl border border-emerald-200 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-emerald-800 dark:bg-slate-900/95`}>
        <div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate font-bold">سورة {name(playing.surah)}</div><div className="truncate text-xs text-slate-500 dark:text-slate-400">مشاري العفاسي • {currentEdition?.name || 'مصحف الروايات'} {playing.offline ? '• محفوظة' : ''}</div></div><button type="button" onClick={() => { const audio = audioRef.current; if (audio) {audio.pause(); audio.removeAttribute('src'); audio.load()}; playingRef.current = null; setPlaying(null) }} className="rounded-xl border px-3 py-1 text-xs">إغلاق</button></div>
        <input aria-label="موضع التلاوة" className="mt-3 w-full accent-emerald-700" type="range" min={0} max={Math.max(1, duration || 1)} value={Math.min(position, duration || 1)} onChange={event => { const audio = audioRef.current; if (audio && Number.isFinite(audio.duration)) { audio.currentTime = Number(event.target.value); setPosition(audio.currentTime) } }}/>
        <div className="flex justify-between text-xs tabular-nums text-slate-500"><span>{fmt(position)}</span><span>{fmt(duration)}</span></div>
        <div className="mt-2 flex items-center justify-center gap-4">
          <button title="السورة السابقة" aria-label="السورة السابقة" onClick={() => adjacent(-1)} type="button" className="rounded-full border p-3"><SkipForward size={20}/></button>
          <button title={paused ? 'تشغيل' : 'إيقاف مؤقت'} onClick={() => { const audio = audioRef.current; if (!audio) return; if (audio.paused) void audio.play().catch(() => setNotice('يتطلب المتصفح بدء الصوت يدويًا.')); else audio.pause() }} type="button" className="rounded-full bg-emerald-700 p-4 text-white">{paused ? <Play size={25}/> : <Pause size={25}/>}</button>
          <button title="السورة التالية" aria-label="السورة التالية" onClick={() => adjacent(1)} type="button" className="rounded-full border p-3"><SkipBack size={20}/></button>
          <select aria-label="سرعة التشغيل" value={speed} onChange={e => { const value = Number(e.target.value); setSpeed(value); if (audioRef.current) audioRef.current.playbackRate = value }} className="rounded-xl border bg-transparent p-2 text-sm"><option value={0.8}>0.8×</option><option value={1}>1×</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option></select>
        </div>
      </div>}
      {!embedded && <Link href="/audio" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm"><ChevronRight size={17}/> العودة للمكتبة الصوتية</Link>}
    </section>
  )
}
