
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
const changes = new Map()
const results = []

function report(file, status, reason = '') {
  results.push({ file, status, reason })
  console.log(`[${status}] ${file}${reason ? ': ' + reason : ''}`)
}

function load(file) {
  const target = path.join(root, file)
  return fs.existsSync(target)
    ? fs.readFileSync(target, 'utf8')
    : null
}

function stage(file, replacements) {
  const original = load(file)

  if (original === null) {
    report(file, 'SKIPPED', 'file is not present in this checkout')
    return
  }

  if (original.includes(marker)) {
    report(file, 'ALREADY', 'patch marker found')
    return
  }

  if (mode === '--check') {
    report(file, 'SKIPPED', 'patch marker not found')
    return
  }

  let proposed = original
  const missing = []

  for (const [before, after] of replacements) {
    const start = proposed.indexOf(before)

    if (start === -1) {
      missing.push(before.split('\n')[0].slice(0, 100))
      continue
    }

    if (
      proposed.indexOf(before, start + before.length) !== -1
    ) {
      missing.push('ambiguous matching code')
      continue
    }

    proposed =
      proposed.slice(0, start) +
      after +
      proposed.slice(start + before.length)
  }

  if (missing.length) {
    report(
      file,
      'SKIPPED',
      `source differs from reviewed version (${missing.length} unmatched sections)`
    )
    return
  }

  changes.set(file, proposed)

  report(
    file,
    mode === '--dry-run' ? 'READY' : 'PATCHED',
    `${replacements.length} checked sections`
  )
}

function stageAlafasy() {
  const file = 'lib/quran/alafasy-collected.ts'
  const original = load(file)

  if (original === null) {
    return report(file, 'SKIPPED', 'file not found')
  }

  if (
    /\bserver\s*:\s*['"`]\/api\/alafasy-audio\//.test(original)
  ) {
    return report(
      file,
      'ALREADY',
      'same-origin audio proxy is configured'
    )
  }

  if (original.includes(marker)) {
    return report(file, 'ALREADY', 'patch marker found')
  }

  if (mode === '--check') {
    return report(file, 'SKIPPED', 'proxy not detected')
  }

  if (load('app/api/alafasy-audio/route.ts') === null) {
    return report(
      file,
      'SKIPPED',
      'audio proxy route is missing; refusing to break playback'
    )
  }

  const matches = [
    ...original.matchAll(
      /^([ \t]*)server\s*:\s*(.+?)\s*,?\s*$/gm
    ),
  ].filter(item =>
    /ALAFASY_COLLECTED_RELEASE|alafasy-collected-quran|githubusercontent\.com/.test(
      item[2]
    )
  )

  if (matches.length !== 1) {
    return report(
      file,
      'SKIPPED',
      'could not identify exactly one Alafasy release server; no change made'
    )
  }

  const [full, indent] = matches[0]

  const next = original.replace(
    full,
    `${indent}// ${marker}: serve Alafasy via a same-origin byte-range route.\n` +
      `${indent}server: '/api/alafasy-audio/',`
  )

  changes.set(file, next)

  report(
    file,
    mode === '--dry-run' ? 'READY' : 'PATCHED',
    'audio source identified safely'
  )
}

try {
  stageAlafasy()

  stage('lib/app-audio.ts', [
    [
      "    bindQuranMediaSession(audio, track.library || {\n      kind: 'library', title: track.title, subtitle: track.subtitle,\n      audioUrl: track.url, reciterName: track.subtitle,\n    })",
      `    // SAMEE3_STABILITY_20261107: expose queue controls on lock screen for all audio.
    const state = appAudio.getSnapshot()
    const controls = {
      next: state.queue.length > 1
        ? () => appAudio.next(1)
        : undefined,
      previous: state.queue.length > 1
        ? () => appAudio.next(-1)
        : undefined,
      play: () => {
        if (
          appAudio.element()?.paused &&
          !appAudio.getSnapshot().loading
        ) appAudio.toggle()
      },
      pause: () => {
        if (
          !appAudio.element()?.paused ||
          appAudio.getSnapshot().loading
        ) appAudio.toggle()
      },
    }
    bindQuranMediaSession(audio, {
      ...(track.library || {
        kind: 'library' as const,
        title: track.title,
        subtitle: track.subtitle,
        audioUrl: track.url,
        reciterName: track.subtitle,
      }),
      ...controls,
    })`,
    ],
  ])

  stage('lib/persistent-player.ts', [
    [
      "    try {\n      const result = audio.play()",
      `    try {
      // SAMEE3_STABILITY_20261107: preserve playback intent.
      ;(audio as HTMLAudioElement & {
        __samee3ExplicitPause?: boolean
      }).__samee3ExplicitPause = false
      const result = audio.play()`,
    ],
    [
      "      if (!switching) wanted = false\n      update({ playing: false, ...(!switching ? { loading: false } : {}) })",
      `      const explicitlyPaused = (
        audio as HTMLAudioElement & {
          __samee3ExplicitPause?: boolean
        }
      ).__samee3ExplicitPause === true

      // SAMEE3_STABILITY_20261107: retain intent on background interruptions.
      if (
        !switching &&
        !(
          document.visibilityState === 'hidden' &&
          wanted &&
          !explicitlyPaused &&
          !audio?.ended
        )
      ) wanted = false

      update({
        playing: false,
        ...(!switching ? { loading: false } : {}),
      })`,
    ],
    [
      "      if (!switching && audio?.getAttribute('src')) fail('تعذر تشغيل التسجيل. تحقق من الاتصال أو من حفظه كاملًا على الجهاز.')",
      `      if (switching || !audio?.getAttribute('src')) return

      // SAMEE3_STABILITY_20261107: allow recovery on temporary network failures.
      if (
        audio.error?.code === 2 &&
        navigator.onLine !== false
      ) {
        update({ loading: true, error: '' })
        return
      }

      fail('تعذر تشغيل التسجيل. تحقق من الاتصال أو من حفظه كاملًا على الجهاز.')`,
    ],
    [
      "      ++serial; wanted = false; switching = true\n      audio?.pause(); audio?.removeAttribute('src'); audio?.load()",
      `      ++serial
      wanted = false
      switching = true

      if (audio) {
        (audio as HTMLAudioElement & {
          __samee3ExplicitPause?: boolean
        }).__samee3ExplicitPause = true
      }

      audio?.pause()
      audio?.removeAttribute('src')
      audio?.load()`,
    ],
    [
      "      if (state.loading || state.playing) { wanted = false; ++serial; switching = false; audio.pause(); update({ playing: false, loading: false }); return }",
      `      if (state.loading || state.playing) {
        (audio as HTMLAudioElement & {
          __samee3ExplicitPause?: boolean
        }).__samee3ExplicitPause = true

        wanted = false
        ++serial
        switching = false
        audio.pause()

        update({ playing: false, loading: false })
        return
      }`,
    ],
  ])

  stage('lib/use-audio-continuity.ts', [
    [
      "  const pause = () => {\n    if (restoring || audio.error) return\n\n    wanted = false",
      `  const pause = () => {
    if (restoring || audio.error) return

    // SAMEE3_STABILITY_20261107: distinguish interruptions from user pauses.
    const explicit = (
      audio as HTMLAudioElement & {
        __samee3ExplicitPause?: boolean
      }
    ).__samee3ExplicitPause === true

    if (
      document.visibilityState === 'hidden' &&
      wanted &&
      !explicit &&
      !audio.ended
    ) {
      save()
      return
    }

    wanted = false`,
    ],
    [
      "  const online = () => schedule(500)",
      `  const visibility = () => {
    if (document.visibilityState !== 'visible') {
      save()
      return
    }

    if (
      !wanted ||
      disposed ||
      audio.ended ||
      !audio.paused ||
      !source()
    ) return

    // Recovery can still require user interaction on iOS.
    void audio.play().catch(() =>
      notify('اضغط تشغيل لاستكمال الصوت بعد العودة للتطبيق.')
    )
  }

  const online = () => schedule(500)`,
    ],
    [
      "  window.addEventListener('pagehide', save)",
      `  window.addEventListener('pagehide', save)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pageshow', visibility)`,
    ],
    [
      "    window.removeEventListener('pagehide', save)",
      `    window.removeEventListener('pagehide', save)
    document.removeEventListener('visibilitychange', visibility)
    window.removeEventListener('pageshow', visibility)`,
    ],
  ])

  stage('app/mushaf/page.tsx', [
    [
      "      if (!isCurrent()) return\n      if (activeReciter?.surahIds.length && !activeReciter.surahIds.includes(surahNumber)) {",
      `      if (!isCurrent()) return

      // SAMEE3_STABILITY_20261107: refresh the collected reciter.
      if (
        targetRiwaya === 'hafs' &&
        expectedReciter === ALAFASY_COLLECTED_RECITER_ID
      ) {
        activeReciter = collectedAlafasyMushafReciter()
      }

      if (activeReciter?.surahIds.length && !activeReciter.surahIds.includes(surahNumber)) {`,
    ],
    [
      "        if (!naturallyFinished && !audio.__samee3Switching) {\n          audio.__samee3Continue = false\n          audio.__samee3Serial = Number(audio.__samee3Serial || 0) + 1\n        }\n        persistAudioSnapshotFromElement(audio, false)",
      `        const interruptedInBackground =
          document.visibilityState === 'hidden' &&
          audio.__samee3Continue === true &&
          !audio.__samee3Switching

        if (
          !naturallyFinished &&
          !audio.__samee3Switching &&
          !interruptedInBackground
        ) {
          audio.__samee3Continue = false
          audio.__samee3Serial =
            Number(audio.__samee3Serial || 0) + 1
        }

        persistAudioSnapshotFromElement(
          audio,
          interruptedInBackground
        )`,
    ],
    [
      "          void runtime.updateRouteAudioSelection(runtime.riwaya, activeReciter, nextSurah).then((updated) => {\n            if (!updated || !audio.__samee3Continue || endSerial !== Number(audio.__samee3Serial || 0)) return\n            return getRuntime()?.loadAudioForSurah(nextSurah, true, undefined, activeReciter)\n          })",
      `          // SAMEE3_STABILITY_20261107: load the next surah before routing.
          void runtime
            .loadAudioForSurah(
              nextSurah,
              true,
              undefined,
              activeReciter
            )
            .then(() => {
              if (
                !audio.__samee3Continue ||
                audio.__samee3Surah !== nextSurah
              ) return

              return runtime.updateRouteAudioSelection(
                runtime.riwaya,
                activeReciter,
                nextSurah
              )
            })
            .catch(() => {
              if (audio.__samee3Surah !== nextSurah) {
                runtime.triggerToast(
                  'تعذر تشغيل السورة التالية. أعد المحاولة.'
                )
              }
            })`,
    ],
    [
      "    const onVisibilityChange = () => {\n      if (document.visibilityState === 'hidden') {\n        persistAudioSnapshotFromElement(audio, !audio.paused)\n      }\n    }",
      `    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistAudioSnapshotFromElement(
          audio,
          audio.__samee3Continue === true
        )
      } else if (
        audio.__samee3Continue &&
        audio.paused &&
        !audio.ended &&
        audio.src &&
        !audio.__samee3Switching
      ) {
        void audio.play().catch(() =>
          setAudioError(
            'اضغط تشغيل لاستكمال التلاوة بعد العودة للتطبيق.'
          )
        )
      }
    }`,
    ],
  ])

  console.log('\n=== SAMEE3 patch report ===')

  const skipped = results.filter(
    x => x.status === 'SKIPPED'
  )

  console.log(
    `Ready/patched: ${
      results.filter(
        x => ['READY', 'PATCHED'].includes(x.status)
      ).length
    }; Already: ${
      results.filter(x => x.status === 'ALREADY').length
    }; Skipped: ${skipped.length}`
  )

  if (skipped.length) {
    console.warn(
      'Some files differ from the reviewed version. They were NOT modified.'
    )
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '## SAMEE3 stability patch',
      '| File | Status | Notes |',
      '|---|---|---|',
      ...results.map(
        x =>
          `| \`${x.file}\` | ${x.status} | ${
            x.reason.replace(/\|/g, '/')
          } |`
      ),
      '',
      'SKIPPED means the corresponding fix was not applied.',
    ]

    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      lines.join('\n') + '\n'
    )
  }

  if (mode === '--apply') {
    for (const [file, content] of changes) {
      fs.writeFileSync(
        path.join(root, file),
        content,
        'utf8'
      )
    }
  }

  console.log(
    mode === '--dry-run'
      ? 'Dry run complete; no files written.'
      : mode === '--check'
        ? 'Check complete.'
        : 'Apply complete; build verification required.'
  )
} catch (error) {
  console.error(
    'ABORTED:',
    error instanceof Error ? error.message : error
  )
  process.exitCode = 1
}
