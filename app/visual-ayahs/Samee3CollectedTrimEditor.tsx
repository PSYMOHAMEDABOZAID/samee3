'use client'

/**
 * SAMEE3 — Collected Alafasy Precision Trim Editor, V8 / standalone.
 * Drop-in replacement for app/visual-ayahs/Samee3CollectedTrimEditor.tsx.
 * This changes ONLY the collected-recitation editor; other readers are untouched.
 * Preserves v3 localStorage keys and public exports used by page.tsx.
 * No page.tsx edits and no additional helper files required.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Pause, Play, RotateCcw, Save, SlidersHorizontal } from 'lucide-react'
import { MAX_DURATION_SECONDS } from '@/lib/samee3-visual-config'

export type CollectedTiming = {
  startSeconds: number
  duration: number
  starts: number[]
}

export type CollectedTrimOffsets = {
  startOffset: number
  endOffset: number
}

type Edge = keyof CollectedTrimOffsets
type PreviewMode = 'start' | 'end' | 'full' | null

type EditorProps = {
  surah: number
  from: number
  to: number
  streamUrl: string
  original: CollectedTiming
  disabled: boolean
  onStop: () => void
  onApply: (timing: CollectedTiming) => void
}

const EMPTY: CollectedTrimOffsets = { startOffset: 0, endOffset: 0 }
const STORAGE_PREFIX = 'samee3_collected_visual_trim_v3:'
const STEP = 0.05
const MAX_OFFSET = 30
const EPSILON = 0.00001

// Self-contained audio envelope for the editor PREVIEW only.
// No import is needed in page.tsx; the page's existing audio/export paths remain untouched.
const EDGE_FADE_SECONDS = 0.09

function edgeGainAt(positionSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const fade = Math.min(EDGE_FADE_SECONDS, durationSeconds / 3)
  return Math.max(0, Math.min(1, positionSeconds / fade, (durationSeconds - positionSeconds) / fade))
}

function muteEdgeGain(node: GainNode | null, context: AudioContext | null): void {
  if (!node || !context || context.state === 'closed') return
  const now = context.currentTime
  node.gain.cancelScheduledValues(now)
  node.gain.setValueAtTime(0, now)
}

function updateEdgeGain(
  node: GainNode | null,
  context: AudioContext | null,
  positionSeconds: number,
  durationSeconds: number
): void {
  if (!node || !context || context.state === 'closed') return
  const now = context.currentTime
  const target = edgeGainAt(positionSeconds, durationSeconds)
  node.gain.cancelScheduledValues(now)
  node.gain.setTargetAtTime(target, now, 0.008)
}

const baseButton =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 ' +
  'text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-[#245343] disabled:cursor-not-allowed ' +
  'disabled:opacity-40 active:scale-[0.99]'
const secondaryButton =
  baseButton + ' border border-[#d9e4da] bg-white text-[#245343] hover:bg-[#edf5ef]'
const primaryButton = baseButton + ' bg-[#245343] text-white hover:bg-[#1c4538]'

function keyFor(surah: number, from: number, to: number): string {
  return `${STORAGE_PREFIX}${surah}:${from}:${to}`
}

function roundOffset(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, value)) / STEP) * STEP
}

function normalizedOffsets(value: CollectedTrimOffsets): CollectedTrimOffsets {
  return {
    startOffset: roundOffset(value.startOffset),
    endOffset: roundOffset(value.endOffset),
  }
}

function sameOffsets(a: CollectedTrimOffsets, b: CollectedTrimOffsets): boolean {
  return (
    Math.abs(a.startOffset - b.startOffset) < EPSILON &&
    Math.abs(a.endOffset - b.endOffset) < EPSILON
  )
}

function readStoredOffsets(surah: number, from: number, to: number): CollectedTrimOffsets {
  if (typeof window === 'undefined') return { ...EMPTY }
  try {
    const raw = window.localStorage.getItem(keyFor(surah, from, to))
    if (!raw) return { ...EMPTY }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...EMPTY }
    const item = parsed as Record<string, unknown>
    if (
      typeof item.startOffset !== 'number' || !Number.isFinite(item.startOffset) ||
      typeof item.endOffset !== 'number' || !Number.isFinite(item.endOffset)
    ) return { ...EMPTY }
    return normalizedOffsets({ startOffset: item.startOffset, endOffset: item.endOffset })
  } catch {
    return { ...EMPTY }
  }
}

/** Pure calculation shared by the editor, preparation and export. */
export function calculateCollectedTrim(
  original: CollectedTiming,
  offsets: CollectedTrimOffsets
): CollectedTiming {
  const startSeconds = Math.max(0, original.startSeconds + offsets.startOffset)
  const endSeconds = original.startSeconds + original.duration + offsets.endOffset
  const duration = endSeconds - startSeconds

  if (
    !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) ||
    !Number.isFinite(duration) || duration < 0.25 ||
    duration > MAX_DURATION_SECONDS ||
    !original.starts.every(Number.isFinite)
  ) {
    throw new Error('حدود المقطع غير صالحة. تأكد من البداية والنهاية والمدة المسموحة.')
  }

  return {
    startSeconds,
    duration,
    starts: original.starts.map((relative) =>
      Math.max(0, Math.min(duration, original.startSeconds + relative - startSeconds))
    ),
  }
}

/** Keeps the existing page.tsx import/API unchanged. */
export function applyStoredCollectedTrim<T extends CollectedTiming>(
  clip: T,
  surah: number,
  from: number,
  to: number
): T {
  const offsets = readStoredOffsets(surah, from, to)
  try {
    return { ...clip, ...calculateCollectedTrim(clip, offsets) }
  } catch {
    return { ...clip, ...calculateCollectedTrim(clip, EMPTY) }
  }
}

function formatOffset(n: number): string {
  const value = Math.abs(n) < EPSILON ? 0 : n
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} ث`
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--.--'
  const whole = Math.floor(seconds)
  const hundredths = Math.round((seconds - whole) * 100)
  if (hundredths === 100) return formatTime(whole + 1)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'تعذر تشغيل المعاينة. تحقق من الاتصال بالتسجيل.'
}

async function waitForMetadata(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= 1) return
  await new Promise<void>((resolve, reject) => {
    let done = false
    const cleanup = () => {
      window.clearTimeout(timeout)
      audio.removeEventListener('loadedmetadata', success)
      audio.removeEventListener('error', fail)
    }
    const success = () => {
      if (done) return
      done = true
      cleanup()
      resolve()
    }
    const fail = () => {
      if (done) return
      done = true
      cleanup()
      reject(new Error('تعذر تحميل تسجيل العفاسي المجمع.'))
    }
    const timeout = window.setTimeout(fail, 18000)
    audio.addEventListener('loadedmetadata', success)
    audio.addEventListener('error', fail)
    if (audio.readyState >= 1) success()
    else audio.load()
  })
}

async function seekTo(audio: HTMLAudioElement, target: number): Promise<void> {
  await waitForMetadata(audio)
  if (Math.abs(audio.currentTime - target) < 0.025) return
  await new Promise<void>((resolve, reject) => {
    let done = false
    const cleanup = () => {
      window.clearTimeout(timeout)
      audio.removeEventListener('seeked', success)
      audio.removeEventListener('error', fail)
    }
    const success = () => {
      if (done) return
      done = true
      cleanup()
      resolve()
    }
    const fail = () => {
      if (done) return
      done = true
      cleanup()
      reject(new Error('تعذر الانتقال إلى موضع التلاوة.'))
    }
    const timeout = window.setTimeout(fail, 11000)
    audio.addEventListener('seeked', success)
    audio.addEventListener('error', fail)
    try {
      audio.currentTime = Math.max(0, target)
      if (!audio.seeking) success()
    } catch {
      fail()
    }
  })
}

export function Samee3CollectedTrimEditor({
  surah, from, to, streamUrl, original, disabled, onStop, onApply,
}: EditorProps) {
  const [draft, setDraft] = useState<CollectedTrimOffsets>({ ...EMPTY })
  const [startText, setStartText] = useState('0.00')
  const [endText, setEndText] = useState('0.00')
  const [zoom, setZoom] = useState<'fine' | 'wide'>('fine')
  const [fineCenter, setFineCenter] = useState({ startOffset: 0, endOffset: 0 })
  const [preview, setPreview] = useState<PreviewMode>(null)
  const [loadingPreview, setLoadingPreview] = useState<PreviewMode>(null)
  const [previewProgress, setPreviewProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [audioDuration, setAudioDuration] = useState<number | null>(null)
  const draftRef = useRef<CollectedTrimOffsets>({ ...EMPTY })
  const appliedRef = useRef<CollectedTrimOffsets>({ ...EMPTY })
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previewContextRef = useRef<AudioContext | null>(null)
  const previewGainRef = useRef<GainNode | null>(null)
  const intervalRef = useRef<number | null>(null)
  const previewSequence = useRef(0)

  const stopPreview = useCallback((updateState = true) => {
    previewSequence.current += 1
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    muteEdgeGain(previewGainRef.current, previewContextRef.current)
    audioRef.current?.pause()
    if (updateState) {
      setLoadingPreview(null)
      setPreview(null)
      setPreviewProgress(0)
    }
  }, [])

  // The parent already applies stored offsets during prepareAudio().
  // Just synchronize the isolated editor; do not call onApply on mount.
  useEffect(() => {
    const stored = readStoredOffsets(surah, from, to)
    let next = stored
    try {
      calculateCollectedTrim(original, stored)
    } catch {
      next = { ...EMPTY }
    }
    draftRef.current = next
    appliedRef.current = next
    setDraft(next)
    setStartText(next.startOffset.toFixed(2))
    setEndText(next.endOffset.toFixed(2))
    setFineCenter({
      startOffset: Math.round(next.startOffset),
      endOffset: Math.round(next.endOffset),
    })
    setAudioDuration(null)
    setMessage('')
    setError('')
    stopPreview()
  }, [surah, from, to, original, stopPreview])

  useEffect(() => () => {
    stopPreview(false)
    const context = previewContextRef.current
    previewContextRef.current = null
    previewGainRef.current = null
    if (context) void context.close().catch(() => {})
  }, [stopPreview])

  async function preparePreviewAudio(audio: HTMLAudioElement): Promise<{
    context: AudioContext
    gain: GainNode
  }> {
    if (previewContextRef.current && previewGainRef.current) {
      await previewContextRef.current.resume()
      return { context: previewContextRef.current, gain: previewGainRef.current }
    }
    const context = new AudioContext()
    const source = context.createMediaElementSource(audio)
    const gain = context.createGain()
    gain.gain.value = 0
    source.connect(gain)
    gain.connect(context.destination)
    previewContextRef.current = context
    previewGainRef.current = gain
    await context.resume()
    return { context, gain }
  }

  const current = useMemo(() => {
    try {
      return calculateCollectedTrim(original, draft)
    } catch {
      return null
    }
  }, [original, draft])

  const exceedsAudio = Boolean(
    current && audioDuration !== null &&
    current.startSeconds + current.duration > audioDuration + 0.15
  )
  const valid = Boolean(current && !exceedsAudio)
  const dirty = !sameOffsets(draft, appliedRef.current)

  function setDraftValue(edge: Edge, value: number) {
    if (disabled || !Number.isFinite(value)) return
    const next = { ...draftRef.current, [edge]: roundOffset(value) }
    draftRef.current = next
    setDraft(next)
    const str = next[edge].toFixed(2)
    if (edge === 'startOffset') setStartText(str)
    else setEndText(str)
    setMessage('')
    setError('')
    if (zoom === 'fine') {
      const center = fineCenter[edge]
      if (next[edge] < center - 3 || next[edge] > center + 3) {
        setFineCenter(previous => ({ ...previous, [edge]: Math.round(next[edge]) }))
      }
    }
  }

  // Commits only at gesture end, not on every slider movement.
  function commit(value: CollectedTrimOffsets = draftRef.current, announce = true) {
    if (disabled) return
    const next = normalizedOffsets(value)
    let adjusted: CollectedTiming
    try {
      adjusted = calculateCollectedTrim(original, next)
      if (audioDuration !== null && adjusted.startSeconds + adjusted.duration > audioDuration + 0.15) {
        throw new Error('النهاية المحددة تتجاوز مدة التسجيل الصوتي.')
      }
    } catch (cause) {
      setError(errorMessage(cause))
      return
    }
    if (sameOffsets(next, appliedRef.current)) return
    stopPreview()
    try {
      // Parent stops the main player and updates the prepared clip once.
      onStop()
      onApply(adjusted)
      appliedRef.current = next
      draftRef.current = next
      setDraft(next)
      setStartText(next.startOffset.toFixed(2))
      setEndText(next.endOffset.toFixed(2))
      setError('')
      try {
        window.localStorage.setItem(keyFor(surah, from, to), JSON.stringify(next))
        if (announce) setMessage('تم تطبيق الضبط وحفظه تلقائيًا لهذا المقطع.')
      } catch {
        setMessage('تم تطبيق الضبط، لكن تعذر حفظه على هذا الجهاز.')
      }
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  function commitTyped(edge: Edge) {
    const raw = (edge === 'startOffset' ? startText : endText).trim().replace(',', '.')
    if (!raw || !Number.isFinite(Number(raw))) {
      const previous = draftRef.current[edge].toFixed(2)
      if (edge === 'startOffset') setStartText(previous)
      else setEndText(previous)
      return
    }
    const next = { ...draftRef.current, [edge]: roundOffset(Number(raw)) }
    draftRef.current = next
    setDraft(next)
    if (edge === 'startOffset') setStartText(next[edge].toFixed(2))
    else setEndText(next[edge].toFixed(2))
    if (zoom === 'fine') {
      setFineCenter(previous => ({ ...previous, [edge]: Math.round(next[edge]) }))
    }
    commit(next)
  }

  function stepBy(edge: Edge, delta: number) {
    if (disabled) return
    const next = { ...draftRef.current, [edge]: roundOffset(draftRef.current[edge] + delta) }
    setDraftValue(edge, next[edge])
    commit(next)
  }

  function reset() {
    if (disabled) return
    stopPreview()
    const next = { ...EMPTY }
    try {
      const adjusted = calculateCollectedTrim(original, next)
      if (!sameOffsets(next, appliedRef.current)) {
        onStop()
        onApply(adjusted)
      }
      appliedRef.current = next
      draftRef.current = next
      setDraft(next)
      setStartText('0.00')
      setEndText('0.00')
      setFineCenter({ startOffset: 0, endOffset: 0 })
      setError('')
      try {
        window.localStorage.removeItem(keyFor(surah, from, to))
        setMessage('تمت استعادة التوقيت الأصلي وحذف الضبط المحفوظ.')
      } catch {
        setMessage('تمت استعادة التوقيت الآن، لكن تعذر حذف الحفظ المحلي.')
      }
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function startPreview(which: Exclude<PreviewMode, null>) {
    if (disabled || !current || exceedsAudio) return
    if (preview === which) {
      stopPreview()
      return
    }
    stopPreview()
    onStop()
    const audio = audioRef.current
    if (!audio) return
    const request = ++previewSequence.current
    setLoadingPreview(which)
    const clipStart = current.startSeconds
    const clipEnd = current.startSeconds + current.duration
    const begin = which === 'end' ? Math.max(clipStart, clipEnd - 3) : clipStart
    const finish = which === 'start' ? Math.min(clipEnd, clipStart + 3) : clipEnd
    try {
      // Initialize Web Audio while still in the user's tap gesture.
      const { context, gain } = await preparePreviewAudio(audio)
      if (previewSequence.current !== request) return
      muteEdgeGain(gain, context)
      await seekTo(audio, begin)
      if (previewSequence.current !== request) return
      await audio.play()
      if (previewSequence.current !== request) {
        audio.pause()
        return
      }
      setPreview(which)
      setLoadingPreview(null)
      setPreviewProgress(0)
      setError('')
      intervalRef.current = window.setInterval(() => {
        if (previewSequence.current !== request || audio.paused || audio.ended) {
          stopPreview()
          return
        }
        const position = audio.currentTime
        updateEdgeGain(gain, context, position - begin, finish - begin)
        setPreviewProgress(Math.min(100, Math.max(0, ((position - begin) / Math.max(0.01, finish - begin)) * 100)))
        if (position >= finish - 0.025) stopPreview()
      }, 25)
    } catch (cause) {
      if (previewSequence.current !== request) return
      stopPreview()
      setError(errorMessage(cause))
    }
  }

  const edgeConfigs: Array<{ edge: Edge; label: string; subtitle: string }> = [
    { edge: 'startOffset', label: 'بداية التلاوة', subtitle: 'تقديم أو تأخير أول الصوت' },
    { edge: 'endOffset', label: 'نهاية التلاوة', subtitle: 'تقديم أو تأخير آخر الصوت' },
  ]

  return (
    <section dir="rtl" aria-label="محرر توقيتات العفاسي المجمع" className="mx-auto mt-5 w-full max-w-[680px] overflow-hidden rounded-[26px] border border-[#d9e5db] bg-[#fcfdf9] text-[#173e33] shadow-[0_12px_35px_rgba(26,70,54,0.07)]">
      <div className="bg-gradient-to-l from-[#245343] to-[#367260] px-4 py-5 text-white sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15"><SlidersHorizontal size={21} /></span>
          <div>
            <h3 className="text-base font-extrabold sm:text-lg">استوديو ضبط تلاوة العفاسي</h3>
            <p className="mt-1 text-xs leading-6 text-[#e3f2e9]">المصحف المجمع · من الآية {from} إلى {to} · دقة 0.05 ثانية</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-6 text-[#edf5ef]">حرّك المؤشر وسيُعتمد التوقيت بعد تركه. المعاينة فيها تنعيم صوتي؛ ويستخدم الفيديو النهائي التوقيت المحفوظ دون أي تعديل لباقي القسم.</p>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold">دقة التحكم</span>
          <div className="flex gap-1 rounded-xl bg-[#eaf2eb] p-1">
            <button type="button" aria-pressed={zoom === 'fine'} onClick={() => {
              setZoom('fine')
              setFineCenter({ startOffset: Math.round(draftRef.current.startOffset), endOffset: Math.round(draftRef.current.endOffset) })
            }} className={`${baseButton} min-h-9 px-3 text-xs ${zoom === 'fine' ? 'bg-white text-[#245343] shadow-sm' : 'text-[#537567]'}`}>دقيق ±3 ث</button>
            <button type="button" aria-pressed={zoom === 'wide'} onClick={() => setZoom('wide')} className={`${baseButton} min-h-9 px-3 text-xs ${zoom === 'wide' ? 'bg-white text-[#245343] shadow-sm' : 'text-[#537567]'}`}>واسع ±30 ث</button>
          </div>
        </div>

        {edgeConfigs.map(({ edge, label, subtitle }) => {
          const value = draft[edge]
          const center = fineCenter[edge]
          const min = zoom === 'wide' ? -MAX_OFFSET : Math.max(-MAX_OFFSET, center - 3)
          const max = zoom === 'wide' ? MAX_OFFSET : Math.min(MAX_OFFSET, center + 3)
          const typed = edge === 'startOffset' ? startText : endText
          const setTyped = edge === 'startOffset' ? setStartText : setEndText
          return (
            <div key={edge} className="rounded-[20px] border border-[#e1e8dd] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="font-extrabold">{label}</h4>
                  <p className="mt-1 text-xs text-[#698174]">{subtitle}</p>
                </div>
                <span className="rounded-lg bg-[#eef5ee] px-3 py-2 text-sm font-extrabold tabular-nums text-[#245343]" dir="ltr">{formatOffset(value)}</span>
              </div>
              <input type="range" aria-label={`تحريك ${label}`} className="mt-5 w-full cursor-pointer accent-[#245343]" min={min} max={max} step={STEP} disabled={disabled} value={value} onChange={event => setDraftValue(edge, Number(event.target.value))} onPointerUp={() => commit()} onPointerCancel={() => commit()} onTouchEnd={() => commit()} onKeyUp={() => commit()} onBlur={() => commit()} />
              <div className="mt-1 flex justify-between text-[11px] text-[#7b8f81]" dir="ltr"><span>{formatOffset(min)}</span><span>{formatOffset(max)}</span></div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button type="button" disabled={disabled} onClick={() => stepBy(edge, -0.25)} className={secondaryButton} aria-label={`تقديم ${label} ربع ثانية`}><ChevronDown size={15} /> 0.25−</button>
                <button type="button" disabled={disabled} onClick={() => stepBy(edge, -STEP)} className={secondaryButton} aria-label={`تقديم ${label} 0.05 ثانية`}>0.05−</button>
                <button type="button" disabled={disabled} onClick={() => stepBy(edge, STEP)} className={secondaryButton} aria-label={`تأخير ${label} 0.05 ثانية`}>0.05+</button>
                <button type="button" disabled={disabled} onClick={() => stepBy(edge, 0.25)} className={secondaryButton} aria-label={`تأخير ${label} ربع ثانية`}>0.25+ <ChevronUp size={15} /></button>
              </div>
              <label className="mt-2 flex min-h-11 items-center justify-between rounded-xl border border-[#d9e4da] px-3">
                <span className="text-xs text-[#718879]">ضبط يدوي بالثواني</span>
                <input type="text" inputMode="decimal" pattern="-?[0-9]*[.,]?[0-9]*" aria-label={`كتابة ${label} بالثواني`} disabled={disabled} value={typed} onChange={event => setTyped(event.target.value)} onBlur={() => commitTyped(edge)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} className="min-w-0 w-24 bg-transparent text-left text-sm font-bold tabular-nums outline-none" dir="ltr" />
              </label>
            </div>
          )
        })}

        <div className="rounded-[18px] bg-[#eef5ee] p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-[11px] text-[#698174]">بداية المقطع</p><p className="mt-1 text-sm font-extrabold tabular-nums" dir="ltr">{current ? formatTime(current.startSeconds) : '--:--'}</p></div>
            <div className="border-x border-[#cddfcf]"><p className="text-[11px] text-[#698174]">نهاية المقطع</p><p className="mt-1 text-sm font-extrabold tabular-nums" dir="ltr">{current ? formatTime(current.startSeconds + current.duration) : '--:--'}</p></div>
            <div><p className="text-[11px] text-[#698174]">مدة الفيديو</p><p className="mt-1 text-sm font-extrabold tabular-nums" dir="ltr">{current ? formatTime(current.duration) : '--:--'}</p></div>
          </div>
        </div>

        <audio ref={audioRef} src={streamUrl} preload="none" className="hidden" onDurationChange={event => {
          const duration = event.currentTarget.duration
          setAudioDuration(Number.isFinite(duration) && duration > 0 ? duration : null)
        }} />

        <div>
          <div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-sm font-extrabold">المعاينة الصوتية</h4>{(preview || loadingPreview) && <span className="text-xs font-bold text-[#398366]">{loadingPreview ? 'جارٍ تجهيز الصوت…' : 'جارٍ الاستماع…'}</span>}</div>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" disabled={disabled || !valid || Boolean(loadingPreview)} onClick={() => void startPreview('start')} className={secondaryButton}>{preview === 'start' ? <Pause size={15} /> : <Play size={15} />} أول 3 ثوانٍ</button>
            <button type="button" disabled={disabled || !valid || Boolean(loadingPreview)} onClick={() => void startPreview('end')} className={secondaryButton}>{preview === 'end' ? <Pause size={15} /> : <Play size={15} />} آخر 3 ثوانٍ</button>
            <button type="button" disabled={disabled || !valid || Boolean(loadingPreview)} onClick={() => void startPreview('full')} className={secondaryButton}>{preview === 'full' ? <Pause size={15} /> : <Play size={15} />} المقطع كاملًا</button>
          </div>
          {preview && <div className="mt-3"><div className="h-1.5 overflow-hidden rounded-full bg-[#dbe9dd]"><div className="h-full rounded-full bg-[#245343] transition-[width] duration-100" style={{ width: `${previewProgress}%` }} /></div><button type="button" onClick={() => stopPreview()} className="mt-2 text-xs font-bold text-[#245343]">إيقاف المعاينة</button></div>}
        </div>

        {(!valid || error) && <p role="alert" className="rounded-xl bg-red-50 px-3 py-3 text-sm leading-6 text-red-800">{error || (exceedsAudio ? 'النهاية تتجاوز مدة التسجيل؛ قدم نهاية المقطع قليلًا.' : 'مدة المقطع غير صالحة؛ عدل التوقيت.')}</p>}
        {message && <p role="status" className="rounded-xl bg-[#e8f5e9] px-3 py-3 text-xs font-semibold leading-6 text-[#245343]">{message}</p>}
        {(draft.startOffset > 0 || draft.endOffset < 0) && (
          <div className="rounded-xl border border-[#e8d8ad] bg-[#fffaf0] px-3 py-3 text-xs leading-6 text-[#73541e]">
            <p>تنبيه: تقديم بداية المقطع أو تقديم نهايته قد يحذف أول أو آخر حرف من التلاوة. استمع لأول وآخر 3 ثوانٍ قبل التصدير. تنعيم المعاينة يقلّل الطقطقة، لكنه لا يعيد حرفًا تم قصّه ولا يغيّر محرّك تصدير الفيديو.</p>
            <button type="button" disabled={disabled} className="mt-2 min-h-10 rounded-lg border border-[#dac895] bg-white px-3 py-2 font-extrabold text-[#624920] disabled:opacity-50" onClick={() => {
              const safe = {
                startOffset: Math.min(0, draftRef.current.startOffset),
                endOffset: Math.max(0, draftRef.current.endOffset),
              }
              draftRef.current = safe
              setDraft(safe)
              setStartText(safe.startOffset.toFixed(2))
              setEndText(safe.endOffset.toFixed(2))
              commit(safe)
            }}>حماية أول وآخر حرف — إلغاء القص الزائد</button>
          </div>
        )}
        <div className="rounded-xl border border-[#d9e4da] bg-white px-3 py-3 text-xs leading-6 text-[#416356]">
          <p className="font-bold">اختياري: هامش أمان حول أول وآخر حرف</p>
          <p className="mt-1">لو بداية الكلمة أو نهايتها مقطوعة، أضف 0.20 ثانية قبل المقطع وبعده، ثم استمع للنتيجة. الهامش لا يعالج توقيتات مصدر غير صحيحة تلقائيًا.</p>
          <button
            type="button"
            disabled={disabled}
            className={secondaryButton + ' mt-2'}
            onClick={() => {
              const next = {
                startOffset: roundOffset(draftRef.current.startOffset - 0.2),
                endOffset: roundOffset(draftRef.current.endOffset + 0.2),
              }
              draftRef.current = next
              setDraft(next)
              setStartText(next.startOffset.toFixed(2))
              setEndText(next.endOffset.toFixed(2))
              commit(next)
            }}
          >
            إضافة هامش أمان 0.20 ثانية
          </button>
        </div>
        {dirty && <p className="text-xs font-semibold text-[#997333]">يوجد تعديل لم يُعتمد بعد. ارفع إصبعك عن المؤشر أو اضغط «تطبيق وحفظ».</p>}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <button type="button" disabled={disabled || !valid || !dirty} onClick={() => commit()} className={primaryButton}><Check size={17} /><Save size={16} /> تطبيق وحفظ الضبط</button>
          <button type="button" disabled={disabled} onClick={reset} className={secondaryButton}><RotateCcw size={16} /> التوقيت الأصلي</button>
        </div>
        <p className="text-center text-[11px] leading-5 text-[#768b7b]">الضبط محفوظ لكل سورة ومدى آيات، وتستخدمه الصفحة الأصلية تلقائيًا في المعاينة الرئيسية والتصدير. لم يتم تغيير صفحة الآيات المرئية.</p>
      </div>
    </section>
  )
}