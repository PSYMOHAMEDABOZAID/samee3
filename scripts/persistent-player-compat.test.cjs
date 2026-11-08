const { test } = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-ts.cjs')
const { createPersistentPlayer } = load('lib/persistent-player.ts')

class AudioStub extends EventTarget {
  constructor() {
    super()
    this.attributes = new Map()
    this.paused = true
    this.ended = false
    this.currentTime = 0
    this.duration = 120
    this.playCalls = 0
  }
  set src(value) { this.attributes.set('src', value); this.currentTime = 0; this.ended = false }
  get src() { return this.attributes.get('src') || '' }
  getAttribute(name) { return this.attributes.get(name) || null }
  removeAttribute(name) { this.attributes.delete(name) }
  load() {}
  play() {
    this.playCalls++
    this.paused = false
    this.ended = false
    this.dispatchEvent(new Event('play'))
    this.dispatchEvent(new Event('playing'))
    return Promise.resolve()
  }
  pause() {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }
  end() { this.paused = true; this.ended = true; this.dispatchEvent(new Event('ended')) }
}

test('adhkar pause-and-resume does not access document in Node.js', () => {
  assert.equal(typeof document, 'undefined')
  const audio = new AudioStub()
  const player = createPersistentPlayer({
    createAudio: () => audio,
    resolve: track => ({ src: track.url }),
    day: () => '2026-11-08',
  })
  const track = (url, itemId) => ({ url, title: url, subtitle: 'القارئ', itemId, listenRepeats: 2 })
  player.start({ scope: 'adhkar', href: '/adhkar', queue: [track('one', 1), track('two', 2)], index: 0, counts: { 1: 3, 2: 1 }, repeat: 'off' })
  audio.end()
  player.toggle()
  assert.equal(audio.paused, true)
  player.toggle()
  assert.equal(player.getSnapshot().playCount, 1)
  audio.end()
  assert.equal(audio.src, 'two')
  audio.end()
  audio.end()
  assert.equal(player.getSnapshot().playing, false)
  assert.deepEqual(player.getSnapshot().counts, { 1: 1, 2: 0 })
})
