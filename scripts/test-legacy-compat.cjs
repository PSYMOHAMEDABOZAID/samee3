'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const mustExist = [
  'app/layout.tsx', 'app/downloads/page.tsx',
  'app/api/legacy-quran/route.ts', 'app/api/legacy-download/route.ts',
  'app/api/legacy-audio/route.ts', 'public/legacy/index.html',
  'public/legacy/audio/index.html', 'components/TelevisionDownloads.tsx',
  'next.config.js',
]
for (const file of mustExist) assert.ok(fs.existsSync(path.join(root, file)), 'Missing file: ' + file)
const layout = read('app/layout.tsx')
const detector = layout.split('const legacyBrowserDetector = `')[1].split('`')[0].replace(/\\\\/g, '\\')
assert.ok(detector.includes('location.replace'))
// Old browser: modern APIs absent -> redirect before React.
let redirected = ''
vm.runInNewContext(detector, {
  location: { pathname: '/', replace: (to) => { redirected = to } },
  Object, Function,
})
assert.equal(redirected, '/legacy/index.html', 'Old browser must open lite version')
// Modern browser: all needed APIs available -> normal site stays untouched.
redirected = ''
vm.runInNewContext(detector, {
  location: { pathname: '/', replace: (to) => { redirected = to } },
  Promise, Map, Set, Symbol, fetch: function () {}, AbortController, Object, Function,
})
assert.equal(redirected, '', 'Modern browsers must stay on the current site')
const lite = read('public/legacy/index.html')
assert.ok(lite.includes('/api/legacy-quran?page=1'))
assert.ok(lite.includes('/api/legacy-download?kind=tv'))
assert.ok(!/<script\b/i.test(lite), 'Lite page must work with no JavaScript')
const audio = read('public/legacy/audio/index.html')
assert.equal((audio.match(/<option value=/g) || []).length, 114, 'Audio index must expose 114 surahs')
const downloads = read('app/downloads/page.tsx')
assert.ok(downloads.includes('/api/legacy-download?kind=tv'))
const tv = read('components/TelevisionDownloads.tsx')
assert.ok(tv.includes("apk || '/api/legacy-download?kind=tv'"))
const config = read('next.config.js')
assert.ok(config.includes("'/api/legacy-quran': ['./data/mushaf/*.text.json.gz']"))
let ts
try { ts = require('typescript') } catch {}
if (ts) {
  for (const file of mustExist.filter((f) => /\.tsx?$/.test(f))) {
    const source = read(file)
    const result = ts.transpileModule(source, { fileName: file, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
    const errors = (result.diagnostics || []).filter((x) => x.category === ts.DiagnosticCategory.Error)
    assert.equal(errors.length, 0, 'TypeScript syntax error in '+file+': '+errors.map((x)=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '))
  }
}
console.log('SAMEE3 Legacy Compatibility: static checks passed ('+mustExist.length+' files).')
if (!ts) console.log('Note: TypeScript syntax check skipped (typescript not installed).')
