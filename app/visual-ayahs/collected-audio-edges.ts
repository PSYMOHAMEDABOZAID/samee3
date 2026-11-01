/**
 * SAMEE3 — audio edge protection for the collected Alafasy recitation.
 * This does not change original Quran recording times or edit any syllables.
 * The same live media clock controls the envelope even when buffering stalls.
 */

export const SAMEE3_EDGE_FADE_SECONDS = 0.09

export function edgeGainAt(
  positionSeconds: number,
  durationSeconds: number,
  fadeSeconds = SAMEE3_EDGE_FADE_SECONDS
): number {
  if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0
  }

  const fade = Math.min(Math.max(0.005, fadeSeconds), durationSeconds / 3)
  const beginning = positionSeconds / fade
  const ending = (durationSeconds - positionSeconds) / fade
  return Math.max(0, Math.min(1, beginning, ending))
}

/** Bring the gain to zero at the hard boundaries. */
export function muteEdgeGain(node: GainNode | null, context: AudioContext | null): void {
  if (!node || !context || context.state === 'closed') return
  const now = context.currentTime
  node.gain.cancelScheduledValues(now)
  node.gain.setValueAtTime(0, now)
}

/**
 * Called by the export progress ticker with the actual <audio>.currentTime.
 * A short smoothing constant prevents clicks from coarse timer updates.
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