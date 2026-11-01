/**
 * SAMEE3 — soft audio boundaries for collected Alafasy MP3.
 * Only removes hard digital clicks at clipped edges; it does not change
 * Quran timing or automatically discard/insert syllables.
 * Works through Web Audio GainNode (including iOS Safari, where
 * HTMLMediaElement.volume changes may be ignored).
 */

/** The short 90ms ramp prevents clicking at a cut without hiding words. */
export const SAMEE3_EDGE_FADE_SECONDS = 0.09

export function edgeGainAt(
  positionSeconds: number,
  durationSeconds: number,
  fadeSeconds = SAMEE3_EDGE_FADE_SECONDS
): number {
  if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const fade = Math.min(Math.max(0.005, fadeSeconds), durationSeconds / 3)
  return Math.max(0, Math.min(1, positionSeconds / fade, (durationSeconds - positionSeconds) / fade))
}

export function muteEdgeGain(node: GainNode | null, context: AudioContext | null): void {
  if (!node || !context || context.state === 'closed') return
  const time = context.currentTime
  node.gain.cancelScheduledValues(time)
  node.gain.setValueAtTime(0, time)
}

/**
 * Call in the existing animation frame / recording progress ticker, using
 * the MP3 element's ACTUAL media position. This stays synchronized if a
 * streamed recording buffers (unlike a timer starting at button press).
 */
export function updateEdgeGain(
  node: GainNode | null,
  context: AudioContext | null,
  positionSeconds: number,
  durationSeconds: number
): void {
  if (!node || !context || context.state === 'closed') return
  const now = context.currentTime
  const target = edgeGainAt(positionSeconds, durationSeconds)
  node.gain.cancelScheduledValues(now)
  node.gain.setTargetAtTime(target, now, 0.008)
}