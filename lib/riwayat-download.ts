'use client'

import { timeoutSignal, combineSignals, throwIfAborted } from '@/lib/abort-signals'


import { StreamingMushafZip, chunksOf, textChunks } from './alafasy-zip-stream'
import { archiveRecords, createArchive, deleteArchive, type ArchiveRecord } from './archive-downloads'

export type DownloadEdition = { id: string; name: string; source: string; sourceUrl: string; surahIds: number[] }
export type RiwayatDownload = { phase: 'preparing' | 'downloading' | 'ready' | 'error'; title: string; percent: number; completed: number; total: number; bytes: number; message: string; archive?: ArchiveRecord }
let state: RiwayatDownload | null = null
let operation: AbortController | null = null
const listeners = new Set<() => void>()
export const subscribeDownload = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const downloadSnapshot = () => state
export const serverDownloadSnapshot = () => null
function update(patch: Partial<RiwayatDownload>) { if (state) { state = { ...state, ...patch }; listeners.forEach(fn => fn()) } }
const cancelled = () => new DOMException('أُوقف التنزيل.', 'AbortError')
export const cancelRiwayatDownload = () => operation?.abort()
export async function clearRiwayatDownload() {
  if (operation) return
  // Closing the card must not delete a ZIP that the browser is still saving.
  state = null; listeners.forEach(fn => fn())
}
export async function restoreRiwayatDownload() {
  if (state || operation || !('indexedDB' in window)) return
  const records = await archiveRecords().catch(() => [])
  for (const record of records) {
    if (!record.ready || Date.now() - record.createdAt > 7 * 86400000) await deleteArchive(record.id).catch(() => {})
  }
  const latest = records.filter(r => r.ready && Date.now() - r.createdAt <= 7 * 86400000).sort((a, b) => b.createdAt - a.createdAt)[0]
  if (latest && !state) {
    state = { phase: 'ready', title: latest.title, percent: 100, total: 0, completed: 0, bytes: latest.size, message: 'ملف ZIP جاهز للحفظ على الجهاز.', archive: latest }
    listeners.forEach(fn => fn())
  }
}
async function requestAudio(url: string, signal: AbortSignal, start: number, end: number) {
  for (let attempt = 0; ; attempt++) {
    throwIfAborted(signal)
    const timeout = timeoutSignal(60000)
    try {
      const response = await fetch(url, { cache: 'no-store', headers: { Range: `bytes=${start}-${end}` }, signal: combineSignals([signal, timeout]) })
      if (![200, 206].includes(response.status) || !response.body || !/^(audio\/|application\/octet-stream)/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel(); throw new Error('تعذر الحصول على ملف الصوت من الناشر.')
      }
      return response
    } catch (error) {
      if (signal.aborted) throw cancelled()
      if (attempt >= 2) throw error
    }
  }
}
/** Range chunks can be retried before they are committed to the ZIP, without duplicate bytes. */
export async function* recordingChunks(url: string, signal: AbortSignal, progress: (bytes: number, total: number) => void): AsyncGenerator<Uint8Array> {
  const step = 2 * 1024 * 1024
  let offset = 0, total = 0
  while (!total || offset < total) {
    let committed = false
    for (let attempt = 0; !committed; attempt++) {
      const response = await requestAudio(url, signal, offset, offset + step - 1)
      if (response.status === 200) {
        if (offset) { await response.body?.cancel(); throw new Error('المصدر لم يستجب لاستكمال الملف. أعد بدء التنزيل.') }
        const declared = Number(response.headers.get('content-length') || 0)
        for await (const chunk of chunksOf(response.body!)) {
          throwIfAborted(signal); offset += chunk.length; progress(offset, declared); yield chunk
        }
        if (!offset || (declared && offset !== declared)) throw new Error('الملف الصوتي غير مكتمل. أعد المحاولة.')
        return
      }
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '')
      if (!range || Number(range[1]) !== offset || Number(range[2]) < offset || Number(range[2]) >= Number(range[3]) || Number(range[2]) - offset >= step || (total && total !== Number(range[3]))) {
        await response.body?.cancel(); throw new Error('المصدر أعاد جزءًا غير صالح من ملف الصوت.')
      }
      total = Number(range[3])
      const expected = Number(range[2]) - offset + 1
      const data = new Uint8Array(expected)
      let used = 0
      try {
        for await (const chunk of chunksOf(response.body!)) {
          throwIfAborted(signal)
          if (used + chunk.length > expected) throw new Error('حجم جزء الصوت غير صحيح.')
          data.set(chunk, used); used += chunk.length
        }
        if (used !== expected) throw new Error('انقطع تنزيل جزء من الصوت.')
        offset += used; progress(offset, total); committed = true; yield data
      } catch (error) { if (signal.aborted || attempt >= 2) throw error }
    }
  }
}
type DiskPicker = (options: object) => Promise<{ createWritable: () => Promise<{ write: (bytes: Uint8Array) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }> }>
export async function startRiwayatDownload(edition: DownloadEdition) {
  if (operation) return
  const ids = [...new Set(edition.surahIds)].sort((a, b) => a - b)
  if (!ids.length || ids.some(id => !Number.isInteger(id) || id < 1 || id > 114)) return
  const controller = new AbortController(); operation = controller
  state = { phase: 'preparing', title: edition.name, percent: 0, total: ids.length, completed: 0, bytes: 0, message: 'اختيار مكان الحفظ…' }
  listeners.forEach(fn => fn())
  const filename = `مشاري العفاسي - ${edition.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-')}.zip`
  let writer: { write: (bytes: Uint8Array) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> } | null = null
  let archive: ArchiveRecord | undefined
  try {
    const nativeWriter = (window as Window & { Samee3FileWriter?: { create: (name: string) => Promise<NonNullable<typeof writer>> } }).Samee3FileWriter
    const picker = (window as Window & { showSaveFilePicker?: DiskPicker }).showSaveFilePicker
    // Invoke the picker before awaiting anything, preserving the actual user gesture.
    const handle = !nativeWriter && picker ? await picker({ suggestedName: filename, types: [{ description: 'ZIP', accept: { 'application/zip': ['.zip'] } }] }) : null
    if (nativeWriter) writer = await nativeWriter.create(filename)
    else if (handle) writer = await handle.createWritable()
    else {
      if (window.Samee3Android) throw new Error('تحميل ZIP داخل نسخة أندرويد يحتاج تحديث APK. يمكنك تحميله الآن بفتح موقع سميع في Chrome.')
      if (!navigator.serviceWorker?.controller) throw new Error('أعد فتح سميع مرة واحدة لتفعيل حفظ ZIP على هذا المتصفح.')
      const registration = await navigator.serviceWorker.ready
      if (!registration.active) throw new Error('خدمة التنزيل غير جاهزة. أعد فتح التطبيق.')
      const channel = new MessageChannel()
      const supported = await new Promise<boolean>(resolve => {
        const timer = setTimeout(() => resolve(false), 2500)
        channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data?.archiveDownload === 1) }
        registration.active!.postMessage({ type: 'SAMEE3_DOWNLOAD_SUPPORT' }, [channel.port2])
      })
      if (!supported) throw new Error('طبّق تحديث سميع أولًا ثم أعد محاولة التنزيل.')
      await restoreRiwayatDownload()
      const estimate = await navigator.storage?.estimate().catch(() => null)
      if (estimate?.quota && estimate.quota - (estimate.usage || 0) < 100 * 1024 * 1024) throw new Error('المساحة المتاحة قليلة. حرّر مساحة أو استخدم Chrome على الكمبيوتر للحفظ المباشر.')
      await navigator.storage?.persist?.().catch(() => false)
      for (const record of await archiveRecords()) if (Date.now() - record.createdAt > 7 * 86400000) await deleteArchive(record.id)
      archive = { id: crypto.randomUUID(), filename, title: edition.name, size: 0, chunks: 0, createdAt: Date.now(), ready: false }
      writer = await createArchive(archive)
    }
    throwIfAborted(controller.signal)
    update({ phase: 'downloading', message: 'جارٍ تحميل السور وتجهيز ZIP…' })
    const zip = new StreamingMushafZip()
    let bytes = 0, lastDraw = 0
    for (let index = 0; index < ids.length; index++) {
      const surah = ids[index]
      let thisFile = 0
      const source = recordingChunks(`/api/alafasy-riwayat?stream=${encodeURIComponent(edition.id)}&surah=${surah}`, controller.signal, (received, total) => {
        thisFile = received
        if (Date.now() - lastDraw > 200) {
          lastDraw = Date.now()
          update({ percent: Math.min(99, Math.floor(((index + (total ? received / total : 0)) / ids.length) * 100)), bytes: bytes + received, message: `السورة ${surah} • ${index + 1} من ${ids.length}` })
        }
      })
      for await (const chunk of zip.add(`${String(surah).padStart(3, '0')}.mp3`, source)) { throwIfAborted(controller.signal); await writer.write(chunk) }
      bytes += thisFile
      update({ completed: index + 1, bytes, percent: Math.min(99, Math.floor((index + 1) / ids.length * 100)) })
    }
    for await (const chunk of zip.add('معلومات المصحف.txt', textChunks(`المصحف: ${edition.name}\nالقارئ: مشاري راشد العفاسي\nالمصدر: ${edition.source}\n${edition.sourceUrl}\nعدد السور: ${ids.length}\n${ids.length === 114 ? 'مصحف كامل: 114 سورة.' : 'التسجيلات المنشورة من هذه الرواية فقط؛ ليست مصحفًا كاملاً.'}\n`))) await writer.write(chunk)
    for (const chunk of zip.finish()) await writer.write(chunk)
    throwIfAborted(controller.signal); await writer.close(); writer = null
    update({ phase: 'ready', percent: 100, archive, message: archive ? 'اكتملت كل السور. اضغط «حفظ ZIP» لتنزيل الملف على جهازك.' : 'اكتمل حفظ ملف ZIP في المكان الذي اخترته.' })
  } catch (error) {
    await writer?.abort().catch(() => {})
    update({ phase: 'error', message: controller.signal.aborted || (error instanceof Error && error.name === 'AbortError') ? 'أُوقف التنزيل. يمكنك بدء محاولة جديدة.' : error instanceof Error ? error.message : 'تعذر إكمال التنزيل. تحقق من الاتصال والمساحة المتاحة.' })
  } finally { operation = null }
}
