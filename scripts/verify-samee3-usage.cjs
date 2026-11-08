/* Optional local verification. Does not modify GitHub or run Actions. */
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const modified = [
  'app/layout.tsx',
  'components/Samee3SleepTimer.tsx',
  'components/PersistentAudioPlayer.tsx',
  'lib/app-audio.ts',
  'lib/samee3-usage-optimizer.ts',
  'app/api/visual-backgrounds/route.ts',
]
for (const file of modified) {
  const code = fs.readFileSync(path.join(root, file), 'utf8')
  const result = ts.transpileModule(code, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const serious = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error)
  assert.equal(serious.length, 0, `${file}: ${serious.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n')}`)
  console.log('SYNTAX OK', file)
}

const helper = fs.readFileSync(path.join(root, 'lib/samee3-usage-optimizer.ts'), 'utf8')
const compiled = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const m = { exports: {} }
vm.runInNewContext(compiled, { module: m, exports: m.exports, URL })
const { directLibraryStreamingUrl, isAlafasyTrack } = m.exports
assert.equal(directLibraryStreamingUrl('https://quran.tv/media/f.mp3'), 'https://quran.tv/media/f.mp3')
assert.equal(directLibraryStreamingUrl('https://ar.assabile.com/media/roqya/4.mp3'), 'https://ar.assabile.com/media/roqya/4.mp3')
for (const url of [
  'http://quran.tv/a.mp3',
  'https://quran.tv.evil.org/a.mp3',
  'https://quran.tv:8080/a.mp3',
  'https://audio.islamweb.net/file.mp3',
  'https://quran.tv/stream.html',
]) assert.equal(directLibraryStreamingUrl(url), null, url)
assert.equal(isAlafasyTrack({ title: 'مشاري العفاسي مصحف مجمع' }), true)
assert.equal(isAlafasyTrack({ subtitle: 'Mishary Alafasy' }), true)
assert.equal(isAlafasyTrack({ title: 'سعد الغامدي' }), false)
console.log('DIRECT MEDIA ALLOWLIST + ALAFASY EXCLUSION OK')

const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8')
const audio = fs.readFileSync(path.join(root, 'lib/app-audio.ts'), 'utf8')
const timer = fs.readFileSync(path.join(root, 'components/Samee3SleepTimer.tsx'), 'utf8')
assert.ok(layout.includes('<Samee3SleepTimer />'))
assert.ok(audio.includes("if (scope === 'riwayat')"))
assert.ok(audio.includes("if (scope === 'adhkar')"))
assert.ok(audio.includes('!isAlafasyTrack(track)'))
assert.ok(timer.includes('__samee3PersistentAudio'))
assert.ok(timer.includes("appAudio.stop('adhkar')"))
assert.ok(timer.includes('router.replace'))
assert.ok(timer.includes('setHours(hour, minute, 0, 0)'))
console.log('INTEGRATION CONTRACT OK')

// Audio continuity: keep the existing Alafasy routes and metadata intact;
// wire persistent controls for Quran, adhkar and library on every route.
const persistentPlayer = fs.readFileSync(path.join(root, 'components/PersistentAudioPlayer.tsx'), 'utf8')
assert.ok(layout.includes('<PersistentAudioPlayer />'), 'Global mini player must be mounted')
assert.ok(persistentPlayer.includes('__samee3PersistentAudio'), 'Must control the Quran element')
assert.ok(persistentPlayer.includes('appAudio.next(1)'), 'Next track must remain reachable')
assert.ok(persistentPlayer.includes('appAudio.next(-1)'), 'Previous track must remain reachable')
assert.ok(persistentPlayer.includes('__samee3ReciterId === 9000123'), 'Collected Alafasy recovery must be excluded')
assert.ok(audio.includes('interruptedWhileHidden'), 'Resume after temporary background interruption')
assert.ok(audio.includes("before.scope !== 'adhkar' && before.scope !== 'library'"), 'End-of-queue fallback must be scoped')
assert.ok(audio.includes('finishedIndex + 1 >= now.queue.length'), 'Never overflow queue')
assert.ok(audio.includes("if (scope === 'riwayat')"), 'Preserve original Alafasy resolver')
console.log('GLOBAL AUDIO CONTROLS, ADHKAR/LIBRARY QUEUE, MUSHAF RECOVERY GUARDS OK')
