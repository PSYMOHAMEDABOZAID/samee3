'use strict'
// SAMEE3: idempotent integration. Does not modify any other audio-library features.
const fs = require('node:fs')
const audioPath = 'app/audio/page.tsx'
if (!fs.existsSync(audioPath)) throw new Error(`Missing file: ${audioPath}`)
let src = fs.readFileSync(audioPath, 'utf8')

if (src.includes('SAMEE3_ALAFASY_TAB_IN_AUDIO_V1')) {
  if (!src.includes('<AlafasyRiwayatContent embedded />')) throw new Error('Tab marker found but component placement is missing. Review audio/page.tsx')
  console.log('Alafasy already integrated. Player and API fixes are installed by the workflow.')
  process.exit(0)
}
const changes = [
  ["import Link from 'next/link'", "import Link from 'next/link'\n// SAMEE3_ALAFASY_TAB_IN_AUDIO_V1\nimport AlafasyRiwayatContent from './alafasy-riwayat/AlafasyRiwayatContent'", 'import'],
  ["type TabKey = 'quran' | 'ruqyah' | 'khutbah' | 'sunnah'", "type TabKey = 'quran' | 'alafasy' | 'ruqyah' | 'khutbah' | 'sunnah'", 'tab type'],
  ["  if (type === 'quran') return <BookOpen size={20} />", "  if (type === 'quran') return <BookOpen size={20} />\n  if (type === 'alafasy') return <Headphones size={20} />", 'tab icon'],
  ["      if (['ruqyah', 'khutbah', 'sunnah'].includes(saved.tab)) {", "      if (saved.tab === 'alafasy') {\n        setActiveTab('alafasy')\n      } else if (['ruqyah', 'khutbah', 'sunnah'].includes(saved.tab)) {", 'persist tab'],
  ["  const tabTitle: Record<TabKey, string> = {\n    quran: 'القرآن الكريم',", "  const tabTitle: Record<TabKey, string> = {\n    quran: 'القرآن الكريم',\n    alafasy: 'مصحف روايات مشاري راشد العفاسي',", 'tab title'],
  ["  const tabDescription: Record<TabKey, string> = {\n    quran: 'تلاوات كاملة مع تشغيل وتنزيل وحفظ للاستماع دون إنترنت.',", "  const tabDescription: Record<TabKey, string> = {\n    quran: 'تلاوات كاملة مع تشغيل وتنزيل وحفظ للاستماع دون إنترنت.',\n    alafasy: 'روايات العفاسي الكاملة والجزئية مع الاستماع والحفظ والتنزيل.',", 'tab description'],
  ['rounded-3xl border border-mushaf-border/35 bg-white p-2 shadow-sm sm:grid-cols-2 lg:grid-cols-4', 'rounded-3xl border border-mushaf-border/35 bg-white p-2 shadow-sm sm:grid-cols-2 lg:grid-cols-5', 'grid layout'],
  ["              ['quran', 'القرآن الكريم'],", "              ['quran', 'القرآن الكريم'],\n              ['alafasy', 'روايات العفاسي'],", 'tab button'],
  ["                    setActiveTab(tab)\n                    setSearch('')", "                    if (tab === 'alafasy') audioRef.current?.pause()\n                    setActiveTab(tab)\n                    setSearch('')", 'pause old player'],
  ["                    if (tab !== 'quran') {", "                    if (tab !== 'quran' && tab !== 'alafasy') {", 'API isolation'],
  ["        ) : (\n          <>\n            {activeTab === 'ruqyah' && (", "        ) : activeTab === 'alafasy' ? (\n          <AlafasyRiwayatContent embedded />\n        ) : (\n          <>\n            {activeTab === 'ruqyah' && (", 'content placement'],
]

// Check all patterns before touching the original file.
for (const [before, , label] of changes) {
  const p = src.indexOf(before)
  if (p < 0 || src.indexOf(before, p + before.length) !== -1) throw new Error(`Could not locate unique integration target: ${label}`)
}
for (const [before, after] of changes) src = src.replace(before, after)
fs.writeFileSync(audioPath, src)
console.log('Integrated Alafasy into SAMEE3 audio tabs; preserved all other sections.')
