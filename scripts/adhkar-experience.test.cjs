const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-ts.cjs')
const { adhkarCategoryAudioCount, getIndividualAdhkarAudio } = load('lib/adhkar-reciters.ts')
const { adhkarListeningCount, parseAdhkarListening } = load('lib/adhkar-listening.ts')
const corpus = require('../public/data/adhkar.json')

test('audio filtering measures the selected voice instead of the generic corpus audio', () => {
  const waking = corpus.find(category => category.id === 3)
  assert.ok(waking.array.every(item => item.audio))
  assert.equal(adhkarCategoryAudioCount('faris-abbad', waking), 0)
  assert.equal(adhkarCategoryAudioCount('hamad-al-drehem', waking), waking.array.length)
})
test('reader availability respects the actual morning and evening wording', () => {
  const item = corpus.find(category => category.id === 1).array.find(item => item.id === 4)
  assert.ok(getIndividualAdhkarAudio('mishary-alafasy', item, 'morning'))
  assert.equal(getIndividualAdhkarAudio('mishary-alafasy', item, 'evening'), null)
})
test('listening preferences reject malformed counts and remain finite', () => {
  for (const value of [null, undefined, {}, [], true, '', '0', -1, Infinity, 2.5, '2e999']) assert.equal(adhkarListeningCount(value), 3)
  assert.equal(adhkarListeningCount('7'), 7)
  assert.equal(adhkarListeningCount(1001), 1000)
  assert.deepEqual(parseAdhkarListening({ listeningMode: 'infinite', customRepeats: -4, viewMode: 'broken' }), { listeningMode: 'remaining', customRepeats: 3, viewMode: 'focus' })
  assert.deepEqual(parseAdhkarListening({ listeningMode: 'custom', customRepeats: '33', viewMode: 'list' }), { listeningMode: 'custom', customRepeats: 33, viewMode: 'list' })
})
test('all 1032 files from the complete v2 bundle retain their URLs, lengths and hashes', () => {
  const data = require('../public/data/adhkar-audio/v1/catalog.json'), baseline = require('../docs/ADHKAR-V2-BASELINE.json')
  const files = new Map()
  for (const item of data.items) {
    for (const clip of Object.values(item.recordings)) files.set(clip.url, clip)
    for (const contexts of Object.values(item.variants || {})) for (const clip of Object.values(contexts)) files.set(clip.url, clip)
  }
  for (const clip of data.sectionRecordings) files.set(clip.url, clip)
  assert.equal(baseline.length, 1032)
  for (const old of baseline) {
    const clip = files.get(old.url)
    assert.ok(clip, old.url); assert.equal(clip.bytes, old.bytes); assert.equal(clip.sha256, old.sha256)
  }
})
