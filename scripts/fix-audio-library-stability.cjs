#!/usr/bin/env node
/*
 * SAMEE3 Audio Library Stability Patch V1
 * Targets the source files already present in the user's SAMEE3 repository.
 * Uses exact anchors and fails closed when the source has changed.
 * No deletion of Cache Storage, IndexedDB, or saved recordings.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const checking = process.argv.includes('--check');
const MARK = 'SAMEE3_AUDIO_LIBRARY_STABLE_V1';
const changes = [];
function replaceExact(content, from, to, pathName, label) {
  const pos = content.indexOf(from);
  if (pos < 0) throw new Error(`[${pathName}] Could not find original block: ${label}. Repository version may have changed; nothing written.`);
  if (content.indexOf(from, pos + from.length) >= 0) throw new Error(`[${pathName}] Multiple blocks matched ${label}; not safe to patch.`);
  return content.slice(0, pos) + to + content.slice(pos + from.length);
}
function patch(name, update) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${name}`);
  const original = fs.readFileSync(file, 'utf8');
  if (original.includes(MARK)) {
    console.log(`Already patched: ${name}`);
    return;
  }
  const updated = update(original);
  if (updated === original || !updated.includes(MARK)) throw new Error(`Patch for ${name} failed validity check`);
  changes.push({ file, name, original, updated });
}
function mainPage(source) {
  const p = 'app/audio/page.tsx';
  let s = source;
  s = replaceExact(s,
`  if (item.kind === 'quran') {
    const cached = await findCachedAudio(item.audioUrl)
    if (cached) {
      checkSize(Number(cached.headers.get('content-length') || 0))
      let blob: Blob | null = null
      try { blob = await cached.blob() } catch {}

      if (blob?.size) {
        checkSize(blob.size)
        return blob
      }
    }
  }`,
`  if (item.kind === 'quran') {
    const cached = await findCachedAudio(item.audioUrl)
    if (cached) {
      // Do not materialize a huge cached MP3 into WebKit's JS heap.
      // Online playback uses a streaming <audio src> instead.
      const size = Number(cached.headers.get('content-length') || 0)
      if (!size || !Number.isSafeInteger(size) ||
          (maxBytes !== undefined && size > maxBytes)) {
        void cached.body?.cancel().catch(() => undefined)
        return null
      }
      let blob: Blob | null = null
      try { blob = await cached.blob() } catch {}
      if (blob?.size) {
        checkSize(blob.size)
        return blob
      }
    }
  }`, p, 'cached blob guard');

  s = replaceExact(s,
`  try {
    const record = await getOffline(offlineKeyFor(item))
    return record?.blob instanceof Blob && record.blob.size > 0
  } catch {
    return false
  }
}`, 
`  try {
    // IndexedDB getKey avoids deserializing a multi-megabyte MP3 just to
    // display a saved/checkmark state.
    const key = offlineKeyFor(item)
    const existing = await offlineRequest<IDBValidKey | undefined>(
      'readonly', store => store.getKey(key)
    )
    return existing !== undefined
  } catch {
    return false
  }
}`, p, 'lightweight offline presence');

  s = replaceExact(s,
`            const response = await cache.match(request)
            if (!response || (!isCompleteAudio(response) && response.type !== 'opaque')) continue

            if (isCompleteAudio(response)) urls.add(request.url)

            if (items.has(request.url) && !items.get(request.url)?.legacyOpaque) continue`,
`            // Cache.keys() is metadata-only. Avoid hundreds of Cache.match()
            // calls and never touch cached audio bodies during initial render.
            urls.add(request.url)
            if (items.has(request.url)) continue`, p, 'metadata-only cache index');

  s = replaceExact(s,
`              legacyOpaque: response.type === 'opaque',`,
`              legacyOpaque: false,`, p, 'cache list entry');

  s = replaceExact(s,
`    void loadBaseLibrary()
    void loadOfflineIndex()
    try {`,
`    void loadBaseLibrary()
    // Give the first paint priority over scanning a large offline library.
    const offlineIndexTimer = window.setTimeout(() => {
      void loadOfflineIndex()
    }, 950)
    try {`, p, 'defer cache index');

  s = replaceExact(s,
`    contextReady.current = true
  }, [loadBaseLibrary, loadOfflineIndex, loadLibraryContent])`,
`    contextReady.current = true
    return () => window.clearTimeout(offlineIndexTimer)
  }, [loadBaseLibrary, loadOfflineIndex, loadLibraryContent])`, p, 'timer cleanup');

  s = replaceExact(s,
`        const savedBlob = cachedStream
          ? null
          : await getSavedBlob(currentPlayer)`,
`        // Stream all online recordings: converting cached MP3s to Blob URLs
        // used to evict the page under iOS memory pressure.
        const needsLocalBlob = navigator.onLine === false || !currentPlayer.audioUrl
        const savedBlob = cachedStream || !needsLocalBlob
          ? null
          : await getSavedBlob(currentPlayer, 32 * 1024 * 1024)`, p, 'stream first playback');

  s = replaceExact(s,
`    const handleTimeUpdate = () =>
      setProgress(old =>
        Math.floor(old) === Math.floor(audio.currentTime || 0)
          ? old
          : audio.currentTime || 0
      )`,
`    // Updating this very large library component every ~250ms on iOS
    // made scrolling and track changes unresponsive. 2-second cadence.
    const handleTimeUpdate = () =>
      setProgress(old =>
        Math.floor(old / 2) === Math.floor((audio.currentTime || 0) / 2)
          ? old
          : audio.currentTime || 0
      )`, p, 'bounded React audio updates');

  // Persist the full view selection so a WKWebView reload does not reset the library.
  s = replaceExact(s,
`  const contextReady = useRef(false)`,
`  const contextReady = useRef(false)
  // ${MARK}: persisted browser navigation, not audio/file storage.
  const rememberedSelection = useRef<{
    riwaya?: number; reciter?: number; moshaf?: number; surah?: number
  } | null>(null)
  const restoredReader = useRef(false)
  const restoredSurah = useRef(false)`, p, 'selection references');

  s = replaceExact(s,
`      const saved = JSON.parse(localStorage.getItem('samee3_audio_view_v2') || '{}')

      if (saved.tab === 'alafasy') {`,
`      const saved = JSON.parse(localStorage.getItem('samee3_audio_view_v2') || '{}') as {
        tab?: string; scholar?: string; book?: string;
        riwaya?: number; reciter?: number; moshaf?: number; surah?: number
      }
      rememberedSelection.current = {
        riwaya: Number(saved.riwaya) || undefined,
        reciter: Number(saved.reciter) || undefined,
        moshaf: Number(saved.moshaf) || undefined,
        surah: Number(saved.surah) || undefined,
      }

      if (saved.tab === 'alafasy') {`, p, 'read saved navigation');

  s = replaceExact(s,
`    if (!contextReady.current) return
    try {
      localStorage.setItem('samee3_audio_view_v2', JSON.stringify({
        tab: activeTab,
        scholar: khutbahScholarId,
        book: selectedSunnahBookId,
      }))
    } catch {}
  }, [activeTab, khutbahScholarId, selectedSunnahBookId])`,
`    if (!contextReady.current || !riwayat.length) return
    const previous = rememberedSelection.current
    if (activeTab === 'quran' && previous && (
      (previous.riwaya && selectedRiwaya?.id !== previous.riwaya) ||
      (previous.reciter && !restoredReader.current) ||
      (previous.surah && !restoredSurah.current)
    )) return
    try {
      localStorage.setItem('samee3_audio_view_v2', JSON.stringify({
        tab: activeTab,
        scholar: khutbahScholarId,
        book: selectedSunnahBookId,
        riwaya: selectedRiwaya?.id,
        reciter: selectedReciter?.id,
        moshaf: selectedMoshaf?.id,
        surah: selectedSurah?.id,
      }))
    } catch {}
  }, [activeTab, khutbahScholarId, selectedSunnahBookId,
      riwayat.length, selectedRiwaya?.id, selectedReciter?.id,
      selectedMoshaf?.id, selectedSurah?.id])

  useEffect(() => {
    if (!contextReady.current || !riwayat.length || activeTab !== 'quran') return
    const desired = rememberedSelection.current?.riwaya
    if (!desired || selectedRiwaya?.id === desired) return
    const match = riwayat.find(row => row.id === desired)
    if (match) setSelectedRiwaya(match)
  }, [riwayat, selectedRiwaya?.id, activeTab])

  useEffect(() => {
    if (restoredReader.current || activeTab !== 'quran') return
    const wanted = rememberedSelection.current
    if (!wanted?.reciter || !wanted?.riwaya ||
        !selectedRiwaya || selectedRiwaya.id !== wanted.riwaya) return
    const reciter = reciters.find(row => row.id === wanted.reciter)
    if (!reciter) return
    const moshaf = reciter.moshaf.find(row => row.id === wanted.moshaf)
      || getMoshafForRiwaya(reciter, selectedRiwaya)
    if (!moshaf) return
    restoredReader.current = true
    setSelectedReciter(reciter)
    setSelectedMoshaf(moshaf)
    setShowReciters(false)
    setShowSurahs(true)
  }, [reciters, selectedRiwaya, activeTab])

  useEffect(() => {
    if (restoredSurah.current || activeTab !== 'quran') return
    const wanted = rememberedSelection.current
    if (!selectedMoshaf || !wanted?.surah || selectedRiwaya?.id !== wanted.riwaya) return
    const surah = surahs.find(row => row.id === wanted.surah)
    if (!surah) return
    restoredSurah.current = true
    setSelectedSurah(surah)
  }, [selectedMoshaf, selectedRiwaya?.id, surahs, activeTab])`, p, 'persist and restore selected view');


  s = replaceExact(s,
`  const selectRiwaya = (riwaya: Riwaya) => {
    pendingPlayRef.current = false`,
`  const selectRiwaya = (riwaya: Riwaya) => {
    rememberedSelection.current = null
    restoredReader.current = true
    restoredSurah.current = true
    pendingPlayRef.current = false`, p, 'manual riwaya selection wins');
  s = replaceExact(s,
`  const selectReciter = (reciter: Reciter) => {
    if (!selectedRiwaya) return`,
`  const selectReciter = (reciter: Reciter) => {
    rememberedSelection.current = null
    restoredReader.current = true
    restoredSurah.current = true
    if (!selectedRiwaya) return`, p, 'manual reciter selection wins');
  return s;
}
function riwayat(source) {
  const p='app/audio/alafasy-riwayat/AlafasyRiwayatContent.tsx';
  let s=source;
  s=replaceExact(s,
`  const lastSavedSecond = useRef(-1)`,
`  const lastSavedSecond = useRef(-1)
  // ${MARK}: repaint the player at most once per second.
  const lastUiSecond = useRef(-1)`, p, 'riwayat time-update ref');
  s=replaceExact(s,
`    setPosition(audio.currentTime)
    if (Math.floor(audio.currentTime / 5) !== lastSavedSecond.current) {`,
`    const second = Math.floor(audio.currentTime)
    if (second !== lastUiSecond.current) {
      lastUiSecond.current = second
      setPosition(audio.currentTime)
    }
    if (Math.floor(audio.currentTime / 5) !== lastSavedSecond.current) {`, p, 'riwayat player repaint');
  s=replaceExact(s,
`    setPlaying(item)
    setPosition(0)`,
`    setPlaying(item)
    lastUiSecond.current = -1
    setPosition(0)`, p, 'ui reset for new surah');
  s=replaceExact(s,
`    if (!navigator.onLine) {
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
    }`,
`    if (!navigator.onLine) {
      const key = fileKey(id, surah)
      if (!saved.includes(key)) {
        setNotice('السورة غير محفوظة. حمّلها وأنت متصل بالإنترنت أولاً.')
        return
      }
      // The service worker serves cached MP3 as a streaming Response with
      // byte-range support, without allocating a giant Blob on the main thread.
      if (navigator.serviceWorker?.controller) {
        attachAudio({editionId: id, surah, url: key, offline: true}, true)
        return
      }
      // Fallback for a browser that has not yet activated the SW.
      // Limit Blob conversion to small files to avoid reloading iOS WebKit.
      void (async () => {
        try {
          const cache = await caches.open(AUDIO_CACHE)
          const entry = await cache.match(key)
          if (!entry) throw new Error('السورة غير محفوظة على الجهاز.')
          const length = Number(entry.headers.get('content-length') || 0)
          if (!length || length > 12 * 1024 * 1024) {
            throw new Error('للسور الطويلة افتح التطبيق بعد تحديثه مرة وأنت متصل حتى يعمل تشغيل الملفات المحفوظة دون تحميلها في الذاكرة.')
          }
          const url = URL.createObjectURL(await entry.blob())
          objectRef.current = url
          attachAudio({editionId: id, surah, url, offline: true}, true)
        } catch (e) { setNotice(errorMessage(e)) }
      })()
      return
    }`, p, 'stream offline recordings');
  return s;
}
function sw(source) {
  const p='public/sw.js';
  let s=source;
  s=replaceExact(s,
`const SW_VERSION = 'samee3-sw-v10'`,
`// ${MARK}: update service-worker code; never delete audio caches.
const SW_VERSION = 'samee3-sw-v11'`, p, 'SW activation version');
  s=replaceExact(s,
`async function serveQuranAudio(request) {`,
`// Saved Alafasy readings are deliberately kept in their existing cache name.
// Streaming them via the SW keeps large offline MP3s out of the page's JS heap.
const RIWAYAT_AUDIO_CACHE = 'samee3-riwayat-audio-v1'
async function serveSavedRiwayatAudio(request) {
  try {
    const cache = await caches.open(RIWAYAT_AUDIO_CACHE)
    const key = new URL(request.url).pathname
    const saved = await cache.match(key)
    if (!saved) return new Response('Audio not saved', { status: 404 })
    const range = request.headers.get('Range')
    return range && saved.type !== 'opaque'
      ? cachedAudioRange(saved, range)
      : saved
  } catch {
    return new Response('Saved audio unavailable', { status: 503 })
  }
}
async function serveQuranAudio(request) {`, p, 'SW streaming route function');
  s=replaceExact(s,
`    if (isQuranAudio(request, url)) {
      event.respondWith(`,
`    if (isSameOrigin(url) &&
        /^\\/audio\\/alafasy-riwayat\\/offline\\/[^/]+\\/\\d{3}\\.mp3$/.test(url.pathname)) {
      event.respondWith(serveSavedRiwayatAudio(request))
      return
    }

    if (isQuranAudio(request, url)) {
      event.respondWith(`, p, 'SW fetch routing');
  return s;
}
function continuity(source) {
  const p='lib/use-audio-continuity.ts';
  let s=source;
  // Do not remove old retry/recovery logic, only prevent an unbounded reload
  // loop while the user is intentionally changing tracks or Safari is hidden.
  s=replaceExact(s,
`    if (
      !disposed &&
      wanted &&
      !timer &&
      navigator.onLine !== false
    ) {`,
`    // ${MARK}: do not schedule retries while the page is hidden and paused.
    if (
      !disposed &&
      wanted &&
      !timer &&
      navigator.onLine !== false &&
      !(document.visibilityState === 'hidden' && audio.paused)
    ) {`, p, 'audio continuity retry guard');
  return s;
}

// Stage all operations first so an unmatched anchor cannot partially update
// the repository. This is also safe to run multiple times.
patch('app/audio/page.tsx', mainPage);
patch('app/audio/alafasy-riwayat/AlafasyRiwayatContent.tsx', riwayat);
patch('lib/use-audio-continuity.ts', continuity);
patch('public/sw.js', sw);
console.log(`Validated ${changes.length} pending file(s).`);
if (!checking) {
  // Atomic per-file replace after all preflight validations are complete.
  for (const change of changes) {
    fs.writeFileSync(`${change.file}.samee3-tmp`, change.updated, 'utf8');
  }
  for (const change of changes) {
    fs.renameSync(`${change.file}.samee3-tmp`, change.file);
    console.log(`Updated ${change.name}`);
  }
}
console.log(checking ? 'Dry-run OK. No files written.' : 'SAMEE3 audio stability patch applied.');
