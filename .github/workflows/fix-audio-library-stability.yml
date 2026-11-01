1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
45
46
47
48
49
50
51
52
53
54
55
56
57
58
59
60
61
62
63
64
65
66
67
68
69
70
71
72
73
74
75
76
77
78
79
80
81
82
83
84
85
86
87
88
89
90
91
92
93
94
95
96
#!/usr/bin/env node
/*
 * SAMEE3 Audio Library Stability Patch V2 (repository drift-safe)
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
function deferInitialOfflineScan(source, pathName) {
  const ready = 'contextReady.current = true';
  const pos = source.indexOf(ready);
  if (pos < 0 || source.indexOf(ready, pos + ready.length) >= 0) {
    throw new Error(`[${pathName}] Cannot uniquely locate initial navigation effect; no files written.`);
  }
  const begin = source.lastIndexOf('  useEffect(() => {', pos);
  const endText = '  }, [loadBaseLibrary, loadOfflineIndex, loadLibraryContent])';
  const end = source.indexOf(endText, pos);
  if (begin < 0 || end < 0 || end - begin > 3000) {
    throw new Error(`[${pathName}] Initial effect has an unexpected structure; no files written.`);
  }
  const endPos = end + endText.length;
  let effect = source.slice(begin, endPos);
  if (!effect.includes('void loadBaseLibrary()')) {
    throw new Error(`[${pathName}] Initial library load is missing from the expected effect; no files written.`);
  }
  if (effect.includes('const offlineIndexTimer =')) {
    if (!effect.includes('clearTimeout(offlineIndexTimer)')) {
      throw new Error(`[${pathName}] Offline timer exists without cleanup; no files written.`);
    }
    console.log(`Already deferred offline index in ${pathName}`);
    return source;
  }
  // Accept whitespace and adjacent comments, but NOT a different function.
  const lines = [...effect.matchAll(/^([ \t]*)void loadOfflineIndex\(\)[ \t]*$/gm)];
  if (lines.length !== 1) {
    // Avoid disabling custom offline-index logic found in another revision.
    throw new Error(`[${pathName}] Found ${lines.length} offline index calls in initial effect (expected 1); no files written.`);
  }
  const spaces = lines[0][1];
  effect = effect.replace(lines[0][0],
    `${spaces}// Defer Cache API scanning until after the first paint.\n` +
    `${spaces}const offlineIndexTimer = window.setTimeout(() => {\n` +
    `${spaces}  void loadOfflineIndex()\n` +
    `${spaces}}, 950)`);
  const cleanup = /^([ \t]*)contextReady\.current = true[ \t]*$/m;
  const found = effect.match(cleanup);
  if (!found) throw new Error(`[${pathName}] Initial effect cleanup insertion point missing; no files written.`);
  const indentation = found[1];
  effect = effect.replace(cleanup,
    `${indentation}contextReady.current = true\n${indentation}return () => window.clearTimeout(offlineIndexTimer)`);
  return source.slice(0, begin) + effect + source.slice(endPos);
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
