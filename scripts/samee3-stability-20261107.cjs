
#!/usr/bin/env node
/*
 SAMEE3 — targeted stability patch for 2026-11-07
 Based on public main as inspected 2026-11-07.
 Idempotent, fail-closed: validate every exact anchor before writing any file.
 Usage: node scripts/samee3-stability-20261107.cjs [--apply|--dry-run|--check]
*/
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const mode = process.argv[2] || '--apply'
if (!['--apply', '--dry-run', '--check'].includes(mode)) {
  console.error('Use --apply, --dry-run or --check')
  process.exit(2)
}
const marker = 'SAMEE3_STABILITY_20261107'
const edits = new Map()
function read(file) {
  const target = path.join(root, file)
  if (!fs.existsSync(target)) throw new Error(`Required file missing: ${file}`)
  const content = fs.readFileSync(target, 'utf8')
  edits.set(file, content)
  return content
}
function replaceOne(text, file, from, to) {
  const first = text.indexOf(from)
  if (first === -1) throw new Error(`Code changed; cannot safely patch ${file}. Missing anchor: ${from.slice(0, 85)}`)
  if (text.indexOf(from, first + from.length) !== -1) throw new Error(`Ambiguous anchor in ${file}: ${from.slice(0, 85)}`)
  return text.slice(0, first) + to + text.slice(first + from.length)
}
function stage(file, replacements) {
  let content = read(file)
  if (mode === '--check') {
    if (!content.includes(marker)) throw new Error(`${file} has not been patched`)
    return
  }
  if (content.includes(marker)) { console.log(`Already patched: ${file}`); return }
  for (const [from, to] of replacements) content = replaceOne(content, file, from, to)
  edits.set(file, content)
  console.log(`Validated patch: ${file}`)
}
try {
  stage('lib/quran/alafasy-collected.ts', [
    ["    server: `${ALAFASY_COLLECTED_RELEASE}/`,",
      "    // SAMEE3_STABILITY_20261107: use same-origin byte-range streaming for Safari.\n    server: '/api/alafasy-audio/',"],
  ])
  stage('lib/app-audio.ts', [
    ["    bindQuranMediaSession(audio, track.library || {\n      kind: 'library', title: track.title, subtitle: track.subtitle,\n      audioUrl: track.url, reciterName: track.subtitle,\n    })",
      `    // SAMEE3_STABILITY_20261107: expose queue controls on lock screen for all audio.
    const state = appAudio.getSnapshot()
    const controls = {
      next: state.queue.length > 1 ? () => appAudio.next(1) : undefined,
      previous: state.queue.length > 1 ? () => appAudio.next(-1) : undefined,
      play: () => {
        if (appAudio.element()?.paused && !appAudio.getSnapshot().loading) appAudio.toggle()
      },
      pause: () => {
        if (!appAudio.element()?.paused || appAudio.getSnapshot().loading) appAudio.toggle()
      },
    }
    bindQuranMediaSession(audio, {
      ...(track.library || {
        kind: 'library' as const, title: track.title, subtitle: track.subtitle,
        audioUrl: track.url, reciterName: track.subtitle,
      }),
      ...controls,
    })`],
  ])
  stage('lib/persistent-player.ts', [
    ["    try {\n      const result = audio.play()",
      "    try {\n      // SAMEE3_STABILITY_20261107: mark intentional playback for interruption handling.\n      ;(audio as HTMLAudioElement & { __samee3ExplicitPause?: boolean }).__samee3ExplicitPause = false\n      const result = audio.play()"],
    ["      if (!switching) wanted = false\n      update({ playing: false, ...(!switching ? { loading: false } : {}) })",
      `      // A notification may temporarily pause a hidden web audio session.
      // Keep the user's play intent, but never override an explicit pause.
      const explicitlyPaused = (audio as HTMLAudioElement & { __samee3ExplicitPause?: boolean }).__samee3ExplicitPause === true
      if (!switching && !(document.visibilityState === 'hidden' && wanted && !explicitlyPaused && !audio?.ended)) wanted = false
      update({ playing: false, ...(!switching ? { loading: false } : {}) })`],
    ["      if (!switching && audio?.getAttribute('src')) fail('تعذر تشغيل التسجيل. تحقق من الاتصال أو من حفظه كاملًا على الجهاز.')",
      `      if (switching || !audio?.getAttribute('src')) return
      // Network stalls are recovered by attachAudioContinuity; do not clear intent early.
      if (audio.error?.code === 2 && navigator.onLine !== false) {
        update({ loading: true, error: '' })
        return
      }
      fail('تعذر تشغيل التسجيل. تحقق من الاتصال أو من حفظه كاملًا على الجهاز.')`],
    ["      ++serial; wanted = false; switching = true\n      audio?.pause(); audio?.removeAttribute('src'); audio?.load()",
      `      ++serial; wanted = false; switching = true
      if (audio) (audio as HTMLAudioElement & { __samee3ExplicitPause?: boolean }).__samee3ExplicitPause = true
      audio?.pause(); audio?.removeAttribute('src'); audio?.load()`],
    ["      if (state.loading || state.playing) { wanted = false; ++serial; switching = false; audio.pause(); update({ playing: false, loading: false }); return }",
      `      if (state.loading || state.playing) {
        (audio as HTMLAudioElement & { __samee3ExplicitPause?: boolean }).__samee3ExplicitPause = true
        wanted = false; ++serial; switching = false; audio.pause()
        update({ playing: false, loading: false }); return
      }`],
  ])
  stage('lib/use-audio-continuity.ts', [
    ["  const pause = () => {\n    if (restoring || audio.error) return\n\n    wanted = false",
      `  const pause = () => {
    if (restoring || audio.error) return
    // SAMEE3_STABILITY_20261107: an OS notification can pause background audio.
    // MediaSession/app controls set __samee3ExplicitPause to respect a deliberate stop.
    const explicit = (audio as HTMLAudioElement & { __samee3ExplicitPause?: boolean }).__samee3ExplicitPause === true
    if (document.visibilityState === 'hidden' && wanted && !explicit && !audio.ended) {
      save()
      return
    }

    wanted = false`],
    ["  const online = () => schedule(500)",
      `  const visibility = () => {
    if (document.visibilityState !== 'visible') { save(); return }
    if (!wanted || disposed || audio.ended || !audio.paused || !source()) return
    // Resume after an OS interruption when permitted; Safari may still need a tap.
    void audio.play().catch(() => notify('اضغط تشغيل لاستكمال الصوت بعد العودة للتطبيق.'))
  }
  const online = () => schedule(500)`],
    ["  window.addEventListener('pagehide', save)",
      "  window.addEventListener('pagehide', save)\n  document.addEventListener('visibilitychange', visibility)\n  window.addEventListener('pageshow', visibility)"],
    ["    window.removeEventListener('pagehide', save)",
      "    window.removeEventListener('pagehide', save)\n    document.removeEventListener('visibilitychange', visibility)\n    window.removeEventListener('pageshow', visibility)"],
  ])
  stage('app/mushaf/page.tsx', [
    ["      if (!isCurrent()) return\n      if (activeReciter?.surahIds.length && !activeReciter.surahIds.includes(surahNumber)) {",
      `      if (!isCurrent()) return
      // SAMEE3_STABILITY_20261107: ignore legacy cached direct-GitHub Alafasy URLs.
      if (targetRiwaya === 'hafs' && expectedReciter === ALAFASY_COLLECTED_RECITER_ID) {
        activeReciter = collectedAlafasyMushafReciter()
      }
      if (activeReciter?.surahIds.length && !activeReciter.surahIds.includes(surahNumber)) {`],
    ["        if (!naturallyFinished && !audio.__samee3Switching) {\n          audio.__samee3Continue = false\n          audio.__samee3Serial = Number(audio.__samee3Serial || 0) + 1\n        }\n        persistAudioSnapshotFromElement(audio, false)",
      `        const interruptedInBackground = document.visibilityState === 'hidden' &&
          audio.__samee3Continue === true && !audio.__samee3Switching
        if (!naturallyFinished && !audio.__samee3Switching && !interruptedInBackground) {
          audio.__samee3Continue = false
          audio.__samee3Serial = Number(audio.__samee3Serial || 0) + 1
        }
        persistAudioSnapshotFromElement(audio, interruptedInBackground)`],
    ["          void runtime.updateRouteAudioSelection(runtime.riwaya, activeReciter, nextSurah).then((updated) => {\n            if (!updated || !audio.__samee3Continue || endSerial !== Number(audio.__samee3Serial || 0)) return\n            return getRuntime()?.loadAudioForSurah(nextSurah, true, undefined, activeReciter)\n          })",
      `          // Start audio first; a reading-map navigation must not block the next surah.
          void runtime.loadAudioForSurah(nextSurah, true, undefined, activeReciter).then(() => {
            if (!audio.__samee3Continue || audio.__samee3Surah !== nextSurah) return
            return runtime.updateRouteAudioSelection(runtime.riwaya, activeReciter, nextSurah)
          }).catch(() => {
            if (audio.__samee3Surah !== nextSurah) runtime.triggerToast('تعذر تشغيل السورة التالية. أعد المحاولة.')
          })`],
    ["    const onVisibilityChange = () => {\n      if (document.visibilityState === 'hidden') {\n        persistAudioSnapshotFromElement(audio, !audio.paused)\n      }\n    }",
      `    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistAudioSnapshotFromElement(audio, audio.__samee3Continue === true)
      } else if (audio.__samee3Continue && audio.paused && !audio.ended &&
        audio.src && !audio.__samee3Switching) {
        void audio.play().catch(() => setAudioError('اضغط تشغيل لاستكمال التلاوة بعد العودة للتطبيق.'))
      }
    }`],
  ])

  if (mode === '--dry-run' || mode === '--check') {
    console.log(mode === '--dry-run' ? 'Dry run completed: all code anchors are present.' : 'Checked: all required files have patch markers.')
    process.exit(0)
  }
  // Transactional: validate every file before writing any files.
  for (const [file, content] of edits) fs.writeFileSync(path.join(root, file), content, 'utf8')
  console.log('SAMEE3 targeted stability fixes applied. Run npm ci && npm run build before committing.')
} catch (error) {
  console.error('ABORTED — no files written:', error instanceof Error ? error.message : error)
  process.exit(1)
}
